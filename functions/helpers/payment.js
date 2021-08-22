const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
const axios = require("axios");
const paystack_api_url = "https://api.paystack.co";
const logErrorInCollection = require("./shared");

// Calculates charge and returns charge and evaluated amount
exports.calculateChargeAmount = async (
  rawAmount,
  chargeDocumentRef,
  conversionRate
) => {
  const chargeAmount = await chargeDocumentRef.once("value", (snapshot) => {
    const chargeObject = snapshot.val();

    let chargeAmount;
    chargeObject.forEach((charge) => {
      if (
        Number(rawAmount) >= Number(charge.lowerLimit) &&
        Number(rawAmount) <= Number(charge.upperLimit)
      ) {
        switch (charge.type) {
          case "flat":
            chargeAmount = Number(charge.amount);
            break;

          case "percentage":
            chargeAmount = (Number(charge.amount) / 100) * Number(rawAmount);
            break;
          default:
            break;
        }
      }
    });

    return chargeAmount;
  });
  const convertedAmount = Number(rawAmount) * Number(conversionRate);

  const evaluatedAmount = convertedAmount - chargeAmount;
  console.log("raw amount " + rawAmount);
  console.log("charge " + chargeAmount);
  console.log("evaluated amount " + evaluatedAmount);
  return {chargeAmount, evaluatedAmount};
};

// makes paystack bank transfer payment
exports.makePaystackPayment = async (
  createTransferRecepientPayload,
  initiateTransferPayload,
  retry
) => {
  if (global.paymentTries > 2) {
    console.log("No of Tries exceeded");
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      message: "Payment could't be made.Try using another bank account",
      timestamp,
      uid: global.triggerDocument.claimant.uid,
      status: 609,
      type: "pay",
      critical: true,
      createdAt: fireStoreDate,
      ref: "",
    };

    await logErrorInCollection(
      global.triggerDocument.vend,
      global.triggerDocument.claimant.uid,
      global.triggerDocument.subvend,
      errorData
    );
    await global.subvendDoc.update({active: false});
    const subVendRef = ref.child(
      `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend`
    );
    await subVendRef.update({status: false});
    return;
  }
  try {
    const transferRecepientResponse = await axios.post(
      `${paystack_api_url}/transferrecipient`,
      createTransferRecepientPayload,
      {
        headers: {
          Authorization: `Bearer ${
            functions.config().paystack_test.secret_key
          }`,
          "Content-Type": "application/json",
        },
      }
    );

    const transferPayload = {
      ...initiateTransferPayload,
      recepient: transferRecepientResponse.data.data.recipient_code,
    };
    const initiateTransferResponse = await axios.post(
      `${paystack_api_url}/transfer`,
      transferPayload,
      {
        headers: {
          Authorization: `Bearer ${
            functions.config().paystack_test.secret_key
          }`,
          "Content-Type": "application/json",
        },
      }
    );
    if (
      initiateTransferResponse.data.status == true &&
      (initiateTransferResponse.data.data.status == "pending" ||
        initiateTransferResponse.data.data.status == "success")
    ) {
      const timestamp = Date.now();

      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "paid",
        ref: initiateTransferResponse.data.data.transfer_code,
        critical: true,
      };

      await logErrorInCollection(
        global.triggerDocument.vend,
        global.triggerDocument.claimant.uid,
        global.triggerDocument.subvend,
        data,
        `${timestamp}_paid`
      );
      await global.booleanObjectRef.update({boolean: false});
      console.log("Payment success");
    }
    console.log("No error in payment but ccouldn't verify status");
    return;
  } catch (error) {
    if (
      error.message.data.message.includes == "insufficient" ||
      error.message.data.message.includes == "Insufficient"
    ) {
      await firestoreDb
        .collection("transactions")
        .doc("payouts")
        .collection("queue")
        .add(global.triggerDocument);

      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "pay",
        ref: "Transaction queued",
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

      return;
    }
    if (retry) {
      global.paymentTries++;
      return await exports.makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload,
        true
      );
    }
    return;
  }
};
// makes flutterwave bank transfer payment
exports.makeFlutterwaveBankPayment = async (
  createTransferRecepientPayload,
  initiateTransferPayload,
  retry
) => {
  if (global.paymentTries > 2) {
    console.log("No of Tries exceeded");
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      message: "Payment could't be made.Try using another bank account",
      timestamp,
      uid: global.triggerDocument.claimant.uid,
      status: 609,
      type: "pay",
      critical: true,
      createdAt: fireStoreDate,
      ref: "",
    };

    await logErrorInCollection(
      global.triggerDocument.vend,
      global.triggerDocument.claimant.uid,
      global.triggerDocument.subvend,
      errorData
    );
    await global.subvendDoc.update({active: false});
    const subVendRef = ref.child(
      `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend`
    );
    await subVendRef.update({status: false});
    return;
  }
  try {
    const transferRecepientResponse = await axios.post(
      `${paystack_api_url}/transferrecipient`,
      createTransferRecepientPayload,
      {
        headers: {
          Authorization: `Bearer ${
            functions.config().paystack_test.secret_key
          }`,
          "Content-Type": "application/json",
        },
      }
    );

    const transferPayload = {
      ...initiateTransferPayload,
      recepient: transferRecepientResponse.data.data.recipient_code,
    };
    const initiateTransferResponse = await axios.post(
      `${paystack_api_url}/transfer`,
      transferPayload,
      {
        headers: {
          Authorization: `Bearer ${
            functions.config().paystack_test.secret_key
          }`,
          "Content-Type": "application/json",
        },
      }
    );
    if (
      initiateTransferResponse.data.status == true &&
      (initiateTransferResponse.data.data.status == "pending" ||
        initiateTransferResponse.data.data.status == "success")
    ) {
      const timestamp = Date.now();

      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "paid",
        ref: initiateTransferResponse.data.data.transfer_code,
        critical: true,
      };

      await logErrorInCollection(
        global.triggerDocument.vend,
        global.triggerDocument.claimant.uid,
        global.triggerDocument.subvend,
        data,
        `${timestamp}_paid`
      );
      await global.booleanObjectRef.update({boolean: false});
      console.log("Payment success");
    }
    console.log("No error in payment but ccouldn't verify status");
    return;
  } catch (error) {
    if (
      error.message.data.message.includes == "insufficient" ||
      error.message.data.message.includes == "Insufficient"
    ) {
      await firestoreDb
        .collection("transactions")
        .doc("payouts")
        .collection("queue")
        .add(global.triggerDocument);

      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "pay",
        ref: "Transaction queued",
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

      return;
    }
    if (retry) {
      global.paymentTries++;
      return await exports.makePaystackPayment(
        createTransferRecepientPayload,
        initiateTransferPayload,
        true
      );
    }
    return;
  }
};
