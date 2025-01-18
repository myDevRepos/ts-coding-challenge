import { Given, Then, When } from "@cucumber/cucumber";
import { accounts } from "../../src/config";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  PrivateKey,
  TokenCreateTransaction,
  TokenInfoQuery,
  Hbar,
  TokenId,
  TokenInfo,
  TokenMintTransaction,
  TokenSupplyType,
} from "@hashgraph/sdk";
import assert from "assert";

const client = Client.forTestnet();

let createdTokenId: TokenId | null = null; // Variable to store the created token ID
let tokenInfo: TokenInfo | null = null;

Given(/^A Hedera account with more than (\d+) hbar$/, async function (expectedBalance: number) {
  const account = accounts[0];
  const MY_ACCOUNT_ID = AccountId.fromString(account.id);
  const MY_PRIVATE_KEY = PrivateKey.fromStringED25519(account.privateKey);
  client.setOperator(MY_ACCOUNT_ID, MY_PRIVATE_KEY);

  // Create the query request
  const query = new AccountBalanceQuery().setAccountId(MY_ACCOUNT_ID);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance, "Account balance is insufficient");
});

When(/^I create a token named Test Token \(HTT\)$/, async function () {
  const treasuryAccountId = AccountId.fromString(accounts[0].id);
  const treasuryPrivateKey = PrivateKey.fromStringED25519(accounts[0].privateKey); // Use fromStringED25519
  const adminPrivateKey = PrivateKey.generateED25519(); // Generate an ED25519 key pair
  const adminPublicKey = adminPrivateKey.publicKey;

  const supplyPrivateKey = PrivateKey.generateED25519(); // Generate a supply key
  const supplyPublicKey = supplyPrivateKey.publicKey;

  // Create the transaction and freeze it for manual signing
  const transaction =  new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setTreasuryAccountId(treasuryAccountId)
    .setDecimals(2)
    .setInitialSupply(10000) // Set an initial supply of 10,000 tokens
    .setSupplyKey(supplyPublicKey) // Assign the supply key
    .setAdminKey(adminPublicKey)
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(client);

  // Sign the transaction with the admin and treasury keys
  const signedTx = await (await transaction.sign(adminPrivateKey)).sign(treasuryPrivateKey);

  // Submit the transaction and get the receipt
  const txResponse = await signedTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  
  
  // Store the created token ID
  createdTokenId = receipt.tokenId;
  this.supplyPrivateKey = supplyPrivateKey; // Store the supply key in the test context
  console.log("The new token ID is " + createdTokenId);
});

Then(/^The token has the name "([^"]*)"$/, async function (expectedTokenName: string) {
  if (!createdTokenId) {
    throw new Error("Token ID was not created");
  }
  
  // Query the token information
  new TokenInfoQuery()
    .setTokenId(createdTokenId)
    .execute(client)
    .then((info) =>{
      tokenInfo = info;
    });

  await new Promise((resolve) => setTimeout(resolve, 5000));
  // Verify the token name
  assert.strictEqual(tokenInfo?.name, expectedTokenName, `Expected token name to be ${expectedTokenName}, but got ${tokenInfo?.name}`);
});

Then(/^The token has the symbol "([^"]*)"$/, async function (TokenSymbol: string) {
  // Verify the token name

  assert.strictEqual(tokenInfo?.symbol, TokenSymbol, `Expected token symbol to be ${TokenSymbol}, but got ${tokenInfo?.symbol}`);
});

Then(/^The token has (\d+) decimals$/, async function (supply: number) {
  assert.strictEqual(tokenInfo?.decimals, supply, `Expected token symbol to be ${supply}, but got ${tokenInfo?.decimals}`);

});

Then(/^The token is owned by the account$/, async function () {
  if (!createdTokenId) {
    throw new Error("Token ID was not created");
  }

  // Get the treasury account details from the accounts array
  const treasuryAccountId = AccountId.fromString(accounts[0].id);
  // Query the balance of the treasury account
  const query = new AccountBalanceQuery().setAccountId(treasuryAccountId);
  const balance = await query.execute(client);
  let tokenBalance = balance.tokens?._map.get(createdTokenId.toString());
  // Check if the treasury account owns the created token
  assert.ok(
    tokenBalance !== undefined && tokenBalance.toNumber() > 0,
    `The account does not own the token ${createdTokenId}`
  );
});


Then(/^An attempt to mint (\d+) additional tokens succeeds$/, async function (tokensToMint: number) {
  if (!createdTokenId) throw new Error("Token ID was not created");

  const mintTx = await new TokenMintTransaction()
    .setTokenId(createdTokenId)
    .setAmount(tokensToMint)
    .freezeWith(client)
    .sign(this.supplyPrivateKey); // Use the stored supply key

  const txResponse = await mintTx.execute(client);
  const receipt = await txResponse.getReceipt(client);

  assert.strictEqual(
    receipt.status.toString(),
    "SUCCESS",
    "Minting additional tokens did not succeed"
  );
});

When(/^I create a fixed supply token named Test Token \(HTT\) with (\d+) tokens$/, async function (initialSupply: number) {
  const treasuryAccountId = AccountId.fromString(accounts[0].id);
  const treasuryPrivateKey = PrivateKey.fromStringED25519(accounts[0].privateKey); // Use fromStringED25519
  const adminPrivateKey = PrivateKey.generateED25519(); // Generate an ED25519 key pair
  const adminPublicKey = adminPrivateKey.publicKey;

  const supplyPrivateKey = PrivateKey.generateED25519(); // Generate a supply key
  const supplyPublicKey = supplyPrivateKey.publicKey;

  // Create the transaction and freeze it for manual signing
  const transaction =  new TokenCreateTransaction()
    .setTokenName("Test Token")
    .setTokenSymbol("HTT")
    .setTreasuryAccountId(treasuryAccountId)
    .setDecimals(2)
    .setMaxSupply(initialSupply)
    .setSupplyType(TokenSupplyType.Finite)
    .setInitialSupply(initialSupply) // Set an initial supply of 10,000 tokens
    .setSupplyKey(supplyPublicKey) // Assign the supply key
    .setAdminKey(adminPublicKey)
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(client);

  // Sign the transaction with the admin and treasury keys
  const signedTx = await (await transaction.sign(adminPrivateKey)).sign(treasuryPrivateKey);

  // Submit the transaction and get the receipt
  const txResponse = await signedTx.execute(client);
  const receipt = await txResponse.getReceipt(client);
  
  
  // Store the created token ID
  createdTokenId = receipt.tokenId;
  this.supplyPrivateKey = supplyPrivateKey; // Store the supply key in the test context
  console.log("The new token ID is " + createdTokenId);
});

Then(/^The total supply of the token is (\d+)$/, async function (expectedSupply: number) {
  if (!createdTokenId) {
    throw new Error("Token ID was not created");
  }
  new TokenInfoQuery()
  .setTokenId(createdTokenId)
  .execute(client)
  .then((info) =>{
    tokenInfo = info;
    console.log(info);
  });
  await new Promise((resolve) => setTimeout(resolve, 5000));

  assert.strictEqual(tokenInfo?.maxSupply, expectedSupply, `Expected token DECIMALS to be ${expectedSupply}, but got ${tokenInfo?.maxSupply}`);
  

});

Then(/^An attempt to mint tokens fails$/, async function () {
  
});

Given(/^A first hedera account with more than (\d+) hbar$/, async function () {


});
Given(/^A second Hedera account$/, async function () {

});
Given(/^A token named Test Token \(HTT\) with (\d+) tokens$/, async function () {

});
Given(/^The first account holds (\d+) HTT tokens$/, async function () {

});
Given(/^The second account holds (\d+) HTT tokens$/, async function () {

});
When(/^The first account creates a transaction to transfer (\d+) HTT tokens to the second account$/, async function () {

});
When(/^The first account submits the transaction$/, async function () {

});
When(/^The second account creates a transaction to transfer (\d+) HTT tokens to the first account$/, async function () {

});
Then(/^The first account has paid for the transaction fee$/, async function () {

});
Given(/^A first hedera account with more than (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A second Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A third Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
Given(/^A fourth Hedera account with (\d+) hbar and (\d+) HTT tokens$/, async function () {

});
When(/^A transaction is created to transfer (\d+) HTT tokens out of the first and second account and (\d+) HTT tokens into the third account and (\d+) HTT tokens into the fourth account$/, async function () {

});
Then(/^The third account holds (\d+) HTT tokens$/, async function () {

});
Then(/^The fourth account holds (\d+) HTT tokens$/, async function () {

});