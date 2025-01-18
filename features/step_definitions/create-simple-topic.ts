import { Given, Then, When } from "@cucumber/cucumber";
import {
  AccountBalanceQuery,
  AccountId,
  Client,
  KeyList,
  PrivateKey,
  Timestamp,
  TopicCreateTransaction,
  TopicMessageQuery, TopicMessageSubmitTransaction
} from "@hashgraph/sdk";
import { accounts } from "../../src/config";
import assert from "node:assert";

// Pre-configured client for test network (testnet)
const client = Client.forTestnet()

//Set the operator with the account ID and private key

Given(/^a first account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[0]
  const account: AccountId = AccountId.fromString(acc.id);
  this.account = account
  const privKey: PrivateKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.privKey = privKey
  client.setOperator(this.account, privKey);

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client)
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance)
});

When(/^A topic is created with the memo "([^"]*)" with the first account as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction();
  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  this.topicId = receipt.topicId;
  // console.log(receipt);
  // console.log(this.topicId);
  assert.ok(this.topicId);
});

When(/^The message "([^"]*)" is published to the topic$/, async function (message: string) {
    const transaction = await new TopicMessageSubmitTransaction()
      .setTopicId(this.topicId)
      .setMessage(message)
      .execute(client);
    const receipt = await transaction.getReceipt(client);
    // console.log(receipt); 
    // console.log(transaction.toString());
    assert.strictEqual(receipt.status.toString(), "SUCCESS");
});

Then(/^The message "([^"]*)" is received by the topic and can be printed to the console$/, async function (message: string) {

  // https://docs.hedera.com/hedera/tutorials/consensus/submit-your-first-message
  // Subscribe to the topic
  let receivedMessage = "";
  console.log("topicId: ", this.topicId.toString());
  console.log("Attempting to subscribe...");
  const startTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
  const endTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

const query =  new TopicMessageQuery()
  .setTopicId(this.topicId)
  // .setLimit(10) // Allow up to 10 messages
  .setStartTime(Timestamp.fromDate(startTime)) // Start from epoch (0)
  .setEndTime(Timestamp.fromDate(endTime)); // End at current time + 10 minutes

  query.subscribe(
      client,
      (message, error) => {
          console.error("Error occurred:", error.message);
      },
      (message) => {
          console.log("Received message:");
          console.log("Contents:", message.contents.toString());
          receivedMessage = message.contents.toString();
          console.log("Consensus timestamp:", message.consensusTimestamp.toString());
          console.log("Sequence number:", message.sequenceNumber);
      }
  );
  console.log("Subscription setup complete.");
  console.log("Waiting for messages...");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  console.log("Done waiting.");
  assert.strictEqual(receivedMessage, message);

});

Given(/^A second account with more than (\d+) hbars$/, async function (expectedBalance: number) {
  const acc = accounts[1];
  const account = AccountId.fromString(acc.id);
  this.secondAccount = account;
  const privKey = PrivateKey.fromStringED25519(acc.privateKey);
  this.secondPrivKey = privKey;

  const query = new AccountBalanceQuery().setAccountId(account);
  const balance = await query.execute(client);
  assert.ok(balance.hbars.toBigNumber().toNumber() > expectedBalance);
});

Given(/^A (\d+) of (\d+) threshold key with the first and second account$/, async function (threshold, totalKeys) {
  const privateKeyList = [this.privKey, this.secondPrivKey];
  const publicKeyList = privateKeyList.map((key) => key.publicKey);

  this.thresholdKey = new KeyList(publicKeyList, threshold);
  console.log(`Threshold key created with ${threshold} of ${totalKeys}.`);
});

When(/^A topic is created with the memo "([^"]*)" with the threshold key as the submit key$/, async function (memo: string) {
  const transaction = new TopicCreateTransaction()
    .setSubmitKey(this.thresholdKey)
    .setTopicMemo(memo);

  const response = await transaction.execute(client);
  const receipt = await response.getReceipt(client);
  this.topicId = receipt.topicId;

  console.log(`Topic created with ID: ${this.topicId}`);

});
