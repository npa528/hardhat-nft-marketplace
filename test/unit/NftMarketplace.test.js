const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { assert, expect } = require("chai")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Nft Marketplace Unit Tests", () => {
          let nftMarketplace, basicNft, deployer, user
          const PRICE = ethers.utils.parseEther("0.1")
          const TOKEN_ID = 0

          beforeEach(async () => {
              accounts = await ethers.getSigners() // could also do with getNamedAccounts
              deployer = accounts[0]
              user = accounts[1]

              await deployments.fixture(["all"])

              nftMarketplaceContract = await ethers.getContract("NftMarketplace")
              nftMarketplace = nftMarketplaceContract.connect(deployer)
              basicNftContract = await ethers.getContract("BasicNft")
              basicNft = await basicNftContract.connect(deployer)

              await basicNft.mintNft()
              await basicNft.approve(nftMarketplaceContract.address, TOKEN_ID)
          })

          describe("List item", () => {
              it("emits event", async () => {
                  expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit(
                      "ItemListed"
                  )
              })

              it("exclusively items that haven't been listed", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)

                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace_AlreadyListed")
              })

              it("exclusively allows owners to list", async () => {
                  nftMarketplace = nftMarketplaceContract.connect(user)
                  await basicNft.approve(user.address, TOKEN_ID)
                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace_NotOwner")
              })

              it("needs approvals to list item", async () => {
                  await basicNft.approve(user.address, TOKEN_ID)

                  await expect(
                      nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NftMarketplace_NotApprovedForMarketplace")
              })

              it("Updates listing with seller and price", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), PRICE.toString())
                  assert.equal(listing.seller.toString(), deployer.address)
              })
          })

          describe("cancelListing", function () {
              it("reverts if there is no listing", async () => {
                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace_NotListed")
              })

              it("reverts if anyone but the owner tries to call", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)

                  await expect(
                      nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace_NotOwner")
              })

              it("emits event and removes listing", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  expect(await nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)).to.emit(
                      "ItemCanceled"
                  )

                  //   await expect(
                  //       nftMarketplace.cancelListing(basicNft.address, TOKEN_ID)
                  //   ).to.be.revertedWith("NftMarketplace_NotListed")

                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), "0")
                  assert.equal(listing.seller, 0)
              })
          })

          describe("buyItem", function () {
              it("reverts if the item isnt listed", async () => {
                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace_NotListed")
              })

              it("reverts if the price isnt met", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)

                  await expect(
                      nftMarketplace.buyItem(basicNft.address, TOKEN_ID)
                  ).to.be.revertedWith("NftMarketplace_PriceNotMet")
              })

              it("transfers the nft to the buyer and updates internal proceeds record", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)

                  expect(
                      await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                          value: PRICE,
                      })
                  ).to.emit("ItemBought")

                  const owner = await basicNft.ownerOf(TOKEN_ID)
                  assert.equal(user.address, owner.toString())

                  const proceeds = await nftMarketplace.getProceeds(deployer.address)
                  assert.equal(proceeds.toString(), PRICE.toString())
              })
          })

          describe("updateListing", function () {
              it("must be owner and listed", async () => {
                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)
                  ).to.be.revertedWith("NotListed")

                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const newPrice = ethers.utils.parseEther("0.2")
                  nftMarketplace = nftMarketplaceContract.connect(user)

                  await expect(
                      nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)
                  ).to.be.revertedWith("NftMarketplace_NotOwner")
              })

              it("updates the price of the item", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  const newPrice = ethers.utils.parseEther("0.2")
                  await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, newPrice)

                  const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                  assert.equal(listing.price.toString(), newPrice.toString())
              })
          })

          describe("withdrawProceeds", function () {
              it("doesn't allow 0 proceed withdrawls", async () => {
                  await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith(
                      "NftMarketplace_NoProceeds"
                  )
              })

              it("withdraws proceeds", async () => {
                  await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                  nftMarketplace = nftMarketplaceContract.connect(user)

                  await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, {
                      value: PRICE,
                  })

                  nftMarketplace = nftMarketplaceContract.connect(deployer)

                  const deployerBalanceBefore = await deployer.getBalance()
                  const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)

                  const txResponse = await nftMarketplace.withdrawProceeds()

                  const transactionReceipt = await txResponse.wait(1)
                  const { gasUsed, effectiveGasPrice } = transactionReceipt
                  const gasCost = gasUsed.mul(effectiveGasPrice)

                  const deployerBalanceAfter = await deployer.getBalance()

                  assert(
                      deployerBalanceAfter.add(gasCost).toString() ==
                          deployerProceedsBefore.add(deployerBalanceBefore).toString()
                  )
              })
          })
      })
