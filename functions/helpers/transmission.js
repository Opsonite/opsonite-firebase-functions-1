const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
const crypto = require("crypto");
const {calculateChargeAmount, makePaystackPayment} = require("./payment");
const logErrorInCollection = require("./shared");

exports.handleBankTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  const conversionRate = await conversionRef.once("value", (snapshot) => {
    return snapshot.val();
  });
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/bank/charges`
  );
  const bankDetails = global.transactionsTrigger.bank.ref.split("_");

  console.log(`Country is ${global.triggerDocument.country}`);
  switch (global.triggerDocument.country) {
    case "NG": {
      const subvendDoc = await await firestoreDb
        .collection("vends")
        .doc(global.triggerDocument.vend)
        .collection("sessions")
        .doc(global.triggerDocument.claimant.uid)
        .collection("subVend")
        .doc(global.triggerDocument.subvend)
        .get();
      global.subvendDoc = subvendDoc;
      const subvendData = subvendDoc.data();
      const {evaluatedAmount} = await calculateChargeAmount(
        subvendData.to.raw,
        chargeDocumentRef,
        conversionRate
      );
      const createTransferRecepientPayload = {
        type: "nuban",
        name: global.transactionsTrigger.bank.acctName,
        account_number: bankDetails[0],
        bank_code: bankDetails[1],
        currency: "NGN",
      };
      const initiateTransferPayload = {
        source: "balance",
        currency: "NGN",
        reference: `${global.transactionsTrigger.vend}_${global.transactionsTrigger.claimant.uid}_${global.transactionsTrigger.subvend}`,
        reason: global.vendDoc.description,
        amount: evaluatedAmount * 100,
      };
      global.paymentTries = 0;

      await makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload
      );
      break;
    }

    default:
      break;
  }
};
exports.handleCharityTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const charityDoc = await await firestoreDb
    .collection("charities")
    .doc(global.triggerDocument.charity)
    .get();
  const charityData = charityDoc.data();

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  const conversionRate = await conversionRef.once("value", (snapshot) => {
    return snapshot.val();
  });
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/bank/charges`
  );

  const bankDetails = charityData.bankRef.split("_");

  console.log(`Country is ${global.triggerDocument.country}`);
  switch (global.triggerDocument.country) {
    case "NG": {
      const subvendDoc = await await firestoreDb
        .collection("vends")
        .doc(global.triggerDocument.vend)
        .collection("sessions")
        .doc(global.triggerDocument.claimant.uid)
        .collection("subVend")
        .doc(global.triggerDocument.subvend)
        .get();
      global.subvendDoc = subvendDoc;
      const subvendData = subvendDoc.data();
      const {evaluatedAmount} = await calculateChargeAmount(
        subvendData.to.raw,
        chargeDocumentRef,
        conversionRate
      );

      const createTransferRecepientPayload = {
        type: "nuban",
        name: charityData.fullName,
        account_number: bankDetails[0],
        bank_code: bankDetails[1],
        currency: "NGN",
      };
      const initiateTransferPayload = {
        source: "balance",
        currency: "NGN",
        reference: `${global.transactionsTrigger.vend}_${global.transactionsTrigger.claimant.uid}_${global.transactionsTrigger.subvend}`,
        reason: global.vendDoc.description,
        amount: evaluatedAmount * 100,
      };
      global.paymentTries = 0;

      await makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload
      );
      await firestoreDb
        .collection("charities")
        .doc(global.transactionsTrigger.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.transactionsTrigger.vend,
          subVendID: global.transactionsTrigger.subvend,
          claimantID: global.transactionsTrigger.claimant.uid,
        });

      break;
    }
    case "GH": {
      const subvendDoc = await await firestoreDb
        .collection("vends")
        .doc(global.triggerDocument.vend)
        .collection("sessions")
        .doc(global.triggerDocument.claimant.uid)
        .collection("subVend")
        .doc(global.triggerDocument.subvend)
        .get();
      global.subvendDoc = subvendDoc;
      const subvendData = subvendDoc.data();
      const {evaluatedAmount} = await calculateChargeAmount(
        subvendData.to.raw,
        chargeDocumentRef,
        conversionRate
      );

      const createTransferRecepientPayload = {
        type: "nuban",
        name: charityData.fullName,
        account_number: bankDetails[0],
        bank_code: bankDetails[1],
        currency: "NGN",
      };
      const initiateTransferPayload = {
        source: "balance",
        currency: "NGN",
        reference: `${global.transactionsTrigger.vend}_${global.transactionsTrigger.claimant.uid}_${global.transactionsTrigger.subvend}`,
        reason: global.vendDoc.description,
        amount: evaluatedAmount * 100,
      };
      global.paymentTries = 0;

      await makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload
      );
      await firestoreDb
        .collection("charities")
        .doc(global.transactionsTrigger.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.transactionsTrigger.vend,
          subVendID: global.transactionsTrigger.subvend,
          claimantID: global.transactionsTrigger.claimant.uid,
        });

      break;
    }

    default:
      break;
  }

  const hashData = `${global.triggerDocument.claimant.uid}${
    functions.config().vendly.twitter_api_secret
  }`;
  const vendDocumentHash = crypto
    .createHash("sha512")
    .update(hashData.toLowerCase())
    .digest("hex");
  const newVendDocument = await firestoreDb
    .collection("vends")

    .add({
      author: global.triggerDocument.claimant.uid,
      straps: {
        twitter: [
          {
            amount: global.triggerDocument.amount,
            handle: global.triggerDocument.twitter.handle,
            isAnonymous: false,
            message: null,
            tid: global.triggerDocument.twitter.tid,
            // eslint-disable-next-line no-octal
            campaign: 0000001,
            auto: {
              domain: global.triggerDocument.domain,
              generate: true,
              hash: vendDocumentHash,
            },
            type: "money",
          },
        ],
      },
    });
  const timestamp = Date.now();
  const fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
  const data = {
    message: "success",
    timestamp,
    vendID: newVendDocument.id,
    status: 200,
    type: "pay",
    Ref: null,
    critical: true,
    createdAt: fireStoreDate,
  };

  await logErrorInCollection(
    global.triggerDocument.vend,
    global.triggerDocument.claimant.uid,
    global.triggerDocument.subvend,
    data,
    `${timestamp}_paid`
  );
  console.log("Payment success");
  await global.booleanObjectRef.update({boolean: false});
  return;
};
exports.handleRevendTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const hashData = `${global.triggerDocument.claimant.uid}${
    functions.config().vendly.twitter_api_secret
  }`;
  const vendDocumentHash = crypto
    .createHash("sha256")
    .update(hashData.toLowerCase())
    .digest("hex");
  const newVendDocument = await firestoreDb
    .collection("vends")

    .add({
      author: global.triggerDocument.claimant.uid,
      straps: {
        twitter: [
          {
            amount: global.triggerDocument.amount,
            handle: global.triggerDocument.twitter.handle,
            isAnonymous: false,
            message: null,
            tid: global.triggerDocument.twitter.tid,
            // eslint-disable-next-line no-octal
            campaign: 0000001,
            auto: {
              domain: global.triggerDocument.domain,
              generate: true,
              hash: vendDocumentHash,
            },
            type: "money",
          },
        ],
      },
    });
  const timestamp = Date.now();
  const fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
  const data = {
    message: "success",
    timestamp,
    vendID: newVendDocument.id,
    status: 200,
    type: "pay",
    Ref: null,
    critical: true,
    createdAt: fireStoreDate,
  };

  await logErrorInCollection(
    global.triggerDocument.vend,
    global.triggerDocument.claimant.uid,
    global.triggerDocument.subvend,
    data,
    `${timestamp}_paid`
  );
  console.log("Payment success");
  await global.booleanObjectRef.update({boolean: false});
  return;
};
