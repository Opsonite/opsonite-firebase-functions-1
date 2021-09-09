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
  sendSmsToUser,
  sendSmsToOwner,
  makeReloadlyAirtimePayment,
} = require("./payment");
const {logErrorInCollection, handleSuccessfulPayment} = require("./shared");

exports.handleBankTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  let conversionRate = global.conversionRefDoc;

  conversionRate = conversionRate.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/${global.triggerDocument.transmission}/charges`
  );
  const bankDetails = global.triggerDocument.bank.ref.split("_");
  let reference = `${global.triggerDocument.vend}_${Date.now()}`;
  reference = reference.toLowerCase();
  console.log(`Country is ${global.triggerDocument.country}`);

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
        reason: global.vendDocData.description,
        amount: amount,
      };
      global.paymentTries = 0;

      const promises = [
        makePaystackPayment(
          createTransferRecepientPayload,
          initiateTransferPayload,
          true
        ),
        sendSmsToOwner(),
      ];
      try {
        return await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
    }
    case "GH": {
      const subvendData = global.subvendDoc.data();
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
        narration: global.vendDocData.description,
        beneficiary_name: global.triggerDocument.bank.acctName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        return await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
    }
    default:
      throw Error("Invalid country for bank");
  }
};
exports.handleCharityTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const charityData = global.charityDoc.data();

  const conversionRate = global.conversionRefDoc.val();
  const chargeDocumentRef = ref.child(
    `institutions/${global.triggerDocument.currency}/bank/charges`
  );

  const bankDetails = charityData.bankRef.split("_");

  console.log(`Country is ${global.triggerDocument.country}`);
  let reference = `${global.triggerDocument.vend}${Date.now()}`;
  reference = reference.toLowerCase();
  switch (global.triggerDocument.country) {
    case "NG": {
      const subvendData = global.subvendDoc.data();
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
        reason: global.vendDocData.description,
        amount: amount,
      };
      global.paymentTries = 0;

      const promises = [
        makePaystackPayment(
          createTransferRecepientPayload,
          initiateTransferPayload,
          true
        ),
        sendSmsToOwner(),
      ];
      try {
        await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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
      const subvendData = global.subvendDoc.data();
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
        narration: global.vendDocData.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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
      const subvendData = global.subvendDoc.data();
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
        narration: global.vendDocData.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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
      const subvendData = global.subvendDoc.data();
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
        narration: global.vendDocData.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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
      const subvendData = global.subvendDoc.data();
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
        narration: global.vendDocData.description,
        beneficiary_name: charityData.fullName,
        amount: amount,
        ...(!!global.triggerDocument.bank.branchCode && {
          destination_branch_code: global.triggerDocument.bank.branchCode,
        }),
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }

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

  const conversionRate = global.conversionRefDoc.val();
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
        narration: global.vendDocData.description,
        beneficiary_name: global.triggerDocument.name,
        amount: amount,
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        return await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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
        narration: global.vendDocData.description,
        beneficiary_name: global.triggerDocument.name,
        amount: amount,
      };
      global.paymentTries = 0;

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        return await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
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

      const promises = [
        makeFlutterwaveBankPayment(initiateTransferPayload, true),
        sendSmsToOwner(),
      ];
      try {
        return await Promise.all(promises);
      } catch (error) {
        console.log("error resolving payment promises");
        throw error;
      }
    }

    default:
      throw Error("Unsupported country");
  }
};

exports.handleAirtimeTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const conversionRate = global.conversionRefDoc.val();
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
    const promises = [
      makeFlutterwaveAirtimePayment(initiateTransferPayload),
      sendSmsToUser(),
      sendSmsToOwner(),
    ];
    try {
      return await Promise.all(promises);
    } catch (error) {
      console.log("error resolving payment promises");
      throw error;
    }
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

    const promises = [
      makeReloadlyAirtimePayment(initiateTransferPayload),
      sendSmsToUser(),
      sendSmsToOwner(),
    ];
    try {
      return await Promise.all(promises);
    } catch (error) {
      console.log("error resolving payment promises");
      throw error;
    }
  }
};
exports.handleGiftCardTransmission = async () => {
  if (!global.triggerDocument) {
    throw Error("trigger document is not set");
  }

  const authorData = global.authorDoc.val();
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
  const promises = [
    makeReloadlyGiftCardPayment(giftCardPayload),
    sendSmsToOwner(),
  ];
  try {
    return await Promise.all(promises);
  } catch (error) {
    console.log("error resolving payment promises");
    throw error;
  }
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
          global.vendDocData.anonymity.reveal == false
            ? "anonymous"
            : global.vendDocData.author.handle,
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
