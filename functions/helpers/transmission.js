const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
const crypto = require("crypto");
const {
  calculateChargeAmount,
  makePaystackPayment,
  makeFlutterwaveBankPayment,
  makeFlutterwaveAirtimePayment,
  makeReloadlyGiftCardPayment,
  makeReloadlyAirtimePayment,
} = require("./payment");
const {logErrorInCollection, handleSuccessfulPayment} = require("./shared");

exports.handleBankTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  let conversionRate = await conversionRef.once("value");
  conversionRate = conversionRate.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/${global.triggerDocument.transmission}/charges`
  );
  const bankDetails = global.triggerDocument.bank.ref.split("_");
  let reference = `${global.triggerDocument.vend}_${Date.now()}`;
  reference = reference.toLowerCase();
  console.log(`Country is ${global.triggerDocument.country}`);
  const subvendRef = firestoreDb
    .collection("vends")
    .doc(global.triggerDocument.vend)
    .collection("sessions")
    .doc(global.triggerDocument.claimant.uid)
    .collection("subVend")
    .doc(global.triggerDocument.subvend);
  global.subvendDoc = subvendRef;
  switch (global.triggerDocument.country) {
    case "NG": {
      const {evaluatedAmount} = await calculateChargeAmount(
        global.triggerDocument.raw,
        chargeDocumentRef,
        conversionRate
      );
      const createTransferRecepientPayload = {
        type: "nuban",
        name: global.triggerDocument.bank.acctName,
        account_number: bankDetails[0],
        bank_code: bankDetails[1],
        currency: "NGN",
      };
      const amount = Math.floor(evaluatedAmount * 100);
      const initiateTransferPayload = {
        source: "balance",
        currency: "NGN",
        reference: reference,
        reason: global.vendDoc.description,
        amount: amount,
      };
      global.paymentTries = 0;

      await makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload,
        true
      );
      break;
    }
    case "GH": {
      const subvendDoc = await firestoreDb
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

      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: bankDetails[1],
        account_number: bankDetails[0],
        currency: "GHS",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: global.triggerDocument.bank.acctName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);

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

  const charityDoc = await firestoreDb
    .collection("charities")
    .doc(global.triggerDocument.charity)
    .get();
  const charityData = charityDoc.data();

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  const conversionReference = await conversionRef.once("value");
  const conversionRate = conversionReference.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/bank/charges`
  );

  const bankDetails = charityData.bankRef.split("_");

  console.log(`Country is ${global.triggerDocument.country}`);
  let reference = `${global.triggerDocument.vend}${Date.now()}`;
  reference = reference.toLowerCase();
  switch (global.triggerDocument.country) {
    case "NG": {
      const subvendDoc = await firestoreDb
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

      const amount = Math.floor(evaluatedAmount * 100);

      const initiateTransferPayload = {
        source: "balance",
        currency: "NGN",
        reference: reference,
        reason: global.vendDoc.description,
        amount: amount,
      };
      global.paymentTries = 0;

      await makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload,
        true
      );
      await firestoreDb
        .collection("charities")
        .doc(global.triggerDocument.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.triggerDocument.vend,
          subVendID: global.triggerDocument.subvend,
          claimantID: global.triggerDocument.claimant.uid,
        });

      break;
    }
    case "GH": {
      const subvendDoc = await firestoreDb
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
      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: bankDetails[1],
        account_number: bankDetails[0],
        currency: "GHS",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);
      await firestoreDb
        .collection("charities")
        .doc(global.triggerDocument.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.triggerDocument.vend,
          subVendID: global.triggerDocument.subvend,
          claimantID: global.triggerDocument.claimant.uid,
        });

      break;
    }
    case "KE": {
      const subvendDoc = await firestoreDb
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
      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: bankDetails[1],
        account_number: bankDetails[0],
        currency: "KES",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);
      await firestoreDb
        .collection("charities")
        .doc(global.triggerDocument.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.triggerDocument.vend,
          subVendID: global.triggerDocument.subvend,
          claimantID: global.triggerDocument.claimant.uid,
        });

      break;
    }
    case "UG": {
      const subvendDoc = await firestoreDb
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
      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: bankDetails[1],
        account_number: bankDetails[0],
        currency: "KES",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);
      await firestoreDb
        .collection("charities")
        .doc(global.triggerDocument.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.triggerDocument.vend,
          subVendID: global.triggerDocument.subvend,
          claimantID: global.triggerDocument.claimant.uid,
        });

      break;
    }
    case "ZA": {
      const subvendDoc = await firestoreDb
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
      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: bankDetails[1],
        account_number: bankDetails[0],
        currency: "ZAR",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);
      await firestoreDb
        .collection("charities")
        .doc(global.triggerDocument.charity)
        .collection("notifications")
        .add({
          type: "charity_alert",
          vendID: global.triggerDocument.vend,
          subVendID: global.triggerDocument.subvend,
          claimantID: global.triggerDocument.claimant.uid,
        });

      break;
    }

    default:
      throw Error("Unsupported country");
  }
  return;
};
exports.handleMobileMoneyTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  let conversionRate = await conversionRef.once("value");
  conversionRate = conversionRate.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/${global.triggerDocument.transmission}/charges`
  );
  let reference = `${global.triggerDocument.vend}${Date.now()}`;

  reference = reference.toLowerCase();
  console.log(`Country is ${global.triggerDocument.country}`);
  switch (global.triggerDocument.country) {
    case "GH": {
      const {evaluatedAmount} = await calculateChargeAmount(
        global.triggerDocument.raw,
        chargeDocumentRef,
        conversionRate
      );

      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: "MTN",
        account_number: global.triggerDocument.phoneRef,
        currency: "GHS",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: global.triggerDocument.name,
        amount: amount,
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);

      break;
    }
    case "KE": {
      const {evaluatedAmount} = await calculateChargeAmount(
        global.triggerDocument.raw,
        chargeDocumentRef,
        conversionRate
      );

      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: "MPS",
        account_number: global.triggerDocument.phoneRef,
        currency: "KES",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: global.triggerDocument.name,
        amount: amount,
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);

      break;
    }
    case "UG": {
      const {evaluatedAmount} = await calculateChargeAmount(
        global.triggerDocument.raw,
        chargeDocumentRef,
        conversionRate
      );

      const amount = Math.floor(evaluatedAmount);

      const initiateTransferPayload = {
        account_bank: "MPS",
        account_number: global.triggerDocument.phoneRef,
        currency: "UGX",
        reference: reference,
        narration: global.vendDoc.description,
        beneficiary_name: global.triggerDocument.name,
        amount: amount,
      };
      global.paymentTries = 0;

      await makeFlutterwaveBankPayment(initiateTransferPayload, true);

      break;
    }

    default:
      throw Error("Unsupported country");
  }
  return;
};

exports.handleAirtimeTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );

  let conversionRate = await conversionRef.once("value");
  conversionRate = conversionRate.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/${global.triggerDocument.transmission}/charges`
  );

  console.log(`Country is ${global.triggerDocument.country}`);

  const phoneDetails = global.triggerDocument.phoneRef.split("_");
  console.log("phoneDetails");
  console.log(phoneDetails[0]);
  const reference = `${global.triggerDocument.vend}_${Date.now()}`;

  if (global.triggerDocument.country == "NG") {
    const {evaluatedAmount} = await calculateChargeAmount(
      global.triggerDocument.raw,
      chargeDocumentRef,
      conversionRate
    );

    const amount = Math.floor(evaluatedAmount);
    global.airtimeAmount = amount;

    const initiateTransferPayload = {
      country: global.triggerDocument.country,
      customer: phoneDetails[0],
      reference: reference,
      amount: amount,
      ...(!!global.triggerDocument.country == "GH" && {
        biller_name: global.triggerDocument.bank.acctName,
      }),
      type: "AIRTIME",
      recurrence: "ONCE",
    };
    await makeFlutterwaveAirtimePayment(initiateTransferPayload);
  }
  if (["ZA", "KE", "UG", "GH"].includes(global.triggerDocument.country)) {
    const {evaluatedAmount} = await calculateChargeAmount(
      global.triggerDocument.raw,
      chargeDocumentRef,
      conversionRate
    );

    const amount = Math.floor(evaluatedAmount);
    global.airtimeAmount = amount;

    const initiateTransferPayload = {
      operatorId: global.triggerDocument.operatorID,
      amount: amount,
      recipientPhone: {
        countryCode: global.triggerDocument.country,
        number: phoneDetails[0],
      },
    };
    await makeReloadlyAirtimePayment(initiateTransferPayload);
  }
};
exports.handleGiftCardTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }
  const authorRef = ref.child(
    `vends/${global.triggerDocument.vend}/public/author/vendle`
  );

  let authorData = await authorRef.once("value");
  authorData = authorData.val();
  const giftCardPayload = {
    countryCode: global.triggerDocument.country,
    email: global.triggerDocument.email,
    productId: global.triggerDocument.giftCard.id,
    customIdentifier: `${global.triggerDocument.vend}_${
      global.triggerDocument.claimant.uid
    }_${global.triggerDocument.subvend}${Date.now()}`,
    senderName: authorData,
    quantity: 1,
    unitPrice: Number(global.triggerDocument.giftCard.amount),
  };
  await makeReloadlyGiftCardPayment(giftCardPayload);
};

exports.handleRevendTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const hashData = `${global.triggerDocument.claimant.uid}${
    functions.config().vendly.twitter_api_secret
  }`;

  console.log("revend hash" + hashData);
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
            amount: Number(global.triggerDocument.amount),
            handle: global.triggerDocument.twitter.handle,
            isAnonymous: false,
            message: null,
            tid: global.triggerDocument.twitter.tid,
          },
        ],
      },
      type: "money",

      campaignId: "0000001",
      auto: {
        domain: global.triggerDocument.domain,
        generate: true,
        hash: vendDocumentHash,
        ref: `${global.triggerDocument.vend}_${global.triggerDocument.subvend}_${global.triggerDocument.claimant.uid}`,
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
    receipt: {
      amount: global.triggerDocument.amount,
      date: fireStoreDate,
      receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,

      recipient: {
        id: global.triggerDocument.claimant.strapID,
        type: global.triggerDocument.strapType,
      },
      revendedTo: {
        handle: global.triggerDocument.twitter.handle,
        newVendID: newVendDocument.id,
        type: global.triggerDocument.strapType,
      },
      sender: {
        id:
          global.vendDoc.anonymity.reveal == false
            ? "anonymous"
            : global.vendDoc.author.handle,
        type: global.triggerDocument.strapType,
      },
      transmission: global.triggerDocument.transmission,
    },
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
  await handleSuccessfulPayment(global.triggerDocument.alias, "Revend");
  return;
};
