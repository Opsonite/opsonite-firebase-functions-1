const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
const axios = require("axios");
const paystack_api_url = "https://api.paystack.co";
const flutterwave_api_url = "https://api.flutterwave.com/v3";
const reloadly_api_url = "https://topups.reloadly.com";
const {
  logErrorInCollection,
  handleSuccessfulPayment,
  generateRandomNumber,
} = require("./shared");

let paystack_secret_key,
  flutterwave_secret_key,
  reloadly_client_id,
  reloadly_secret_key;

const setEnvironment = () => {
  if (global.triggerDocument && global.triggerDocument.domain == "live") {
    console.log("function environment is live");
    paystack_secret_key = functions.config().paystack_live.secret_key;
    flutterwave_secret_key = functions.config().flutterwave.secret_key;
    reloadly_client_id = functions.config().reloadly.client_id;
    reloadly_secret_key = functions.config().reloadly.client_secret;
  } else {
    console.log("function environment is test");

    paystack_secret_key = functions.config().paystack_test.secret_key;
    flutterwave_secret_key = functions.config().flutterwave.test_secret_key;
    reloadly_client_id = functions.config().reloadly.test_client_id;
    reloadly_secret_key = functions.config().reloadly.test_client_secret;
  }
};
// Calculates charge and returns charge and evaluated amount
exports.calculateChargeAmount = async (
  rawAmount,
  chargeDocumentRef,
  conversionRate
) => {
  let chargeRef = await chargeDocumentRef.once("value");

  let chargeObject = chargeRef.val();

  let chargeAmount;

  for (const tier in chargeObject) {
    if (
      Number(rawAmount) >= Number(chargeObject[tier].lowerLimit) &&
      Number(rawAmount) <= Number(chargeObject[tier].upperLimit)
    ) {
      console.log("tier is " + tier);
      console.log("type is " + chargeObject[tier].type);
      switch (chargeObject[tier].type) {
        case "flat":
          chargeAmount = Number(chargeObject[tier].amount);
          break;

        case "percentage":
          chargeAmount =
            (Number(chargeObject[tier].amount) / 100) * Number(rawAmount);
          break;
        default:
          break;
      }
    }
  }

  const convertedAmount = Number(rawAmount) / Number(conversionRate);
  global.chargeAmount = chargeAmount;
  const evaluatedAmount = convertedAmount - chargeAmount;
  console.log("raw amount " + rawAmount);
  console.log("converted amount " + convertedAmount);
  console.log("exchange rate" + conversionRate);
  console.log("charge " + chargeAmount);
  console.log("evaluated amount " + evaluatedAmount);
  return {chargeAmount, evaluatedAmount};
};

// makes paystack bank transfer payment,supports retry
exports.makePaystackPayment = async (
  createTransferRecepientPayload,
  initiateTransferPayload,
  retry
) => {
  setEnvironment();
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
      errorData,
      `${timestamp}_paid`
    );
    await global.subvendDoc.update({active: false});
    const subVendRef = ref.child(
      `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend`
    );
    await subVendRef.update({status: false});
    return;
  }
  const randomNumber = generateRandomNumber();
  initiateTransferPayload.reference = `${initiateTransferPayload.reference}-${randomNumber}`;
  console.log("payload is ");
  console.log(initiateTransferPayload);
  try {
    const transferRecepientResponse = await axios.post(
      `${paystack_api_url}/transferrecipient`,
      createTransferRecepientPayload,
      {
        headers: {
          Authorization: `Bearer ${paystack_secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );

    const transferPayload = {
      ...initiateTransferPayload,
      recipient: transferRecepientResponse.data.data.recipient_code,
    };
    const initiateTransferResponse = await axios.post(
      `${paystack_api_url}/transfer`,
      transferPayload,
      {
        headers: {
          Authorization: `Bearer ${paystack_secret_key}`,
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
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        claimantUID: global.triggerDocument.claimant.uid,
        createdAt: fireStoreDate,
        timestamp,
        receipt: {
          ...(typeof global.chargeAmount !== "undefined" && {
            charge: global.chargeAmount,
          }),
          amount: initiateTransferResponse.data.data.amount,
          date: fireStoreDate,
          receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,
          receivedInto: {
            name: global.triggerDocument.bank.acctName,
            reference:
              global.triggerDocument.transmission == "charity"
                ? global.triggerDocument.charity
                : global.triggerDocument.bank.ref,
          },
          recipient: {
            id: global.triggerDocument.claimant.strapID,
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
      console.log("Payment success");
      await handleSuccessfulPayment(
        initiateTransferResponse.data.data.transfer_code,
        "Paystack"
      );
      return;
    }
    console.log("No error in payment but ccouldn't verify status");
    return;
  } catch (error) {
    console.log("paystack bank error");

    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }
    if (
      error.response?.data?.message.includes("insufficient") ||
      error.response?.data?.message.includes("Insufficient")
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
// makes flutterwave bank transfer payment supports retry
exports.makeFlutterwaveBankPayment = async (initiateTransferPayload, retry) => {
  setEnvironment();

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
      errorData,
      `${timestamp}_paid`
    );
    await global.subvendDoc.update({active: false});
    const subVendRef = ref.child(
      `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend`
    );
    await subVendRef.update({status: false});
    return;
  }

  console.log("payload is ");
  console.log(initiateTransferPayload);
  try {
    const randomNumber = generateRandomNumber();
    initiateTransferPayload.reference = `${initiateTransferPayload.reference}-${randomNumber}`;
    const initiateTransferResponse = await axios.post(
      `${flutterwave_api_url}/transfers`,
      initiateTransferPayload,
      {
        headers: {
          Authorization: `Bearer ${flutterwave_secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (initiateTransferResponse.data.status == "success") {
      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "paid",
        ref: initiateTransferResponse.data.data.reference,
        critical: true,
        receipt: {
          ...(typeof global.chargeAmount !== "undefined" && {
            charge: global.chargeAmount,
          }),
          amount: initiateTransferResponse.data.data.amount,
          date: fireStoreDate,
          receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,
          receivedInto: {
            name: "",
            reference:
              global.triggerDocument.transmission == "charity"
                ? global.triggerDocument.charity
                : global.triggerDocument.bank.ref,
          },
          recipient: {
            id: global.triggerDocument.claimant.strapID,
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
      await handleSuccessfulPayment(
        initiateTransferResponse.data.data.reference,
        "Flutterwave"
      );
      return;
    }
    console.log("No error in payment but couldn't verify status");
    return;
  } catch (error) {
    console.log("flutterwave bank error");
    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }

    if (
      error.response?.data?.message.includes("insufficient") ||
      error.response?.data?.message.includes("Insufficient")
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
      return await exports.makeFlutterwaveBankPayment(
        initiateTransferPayload,
        true
      );
    }
    return;
  }
};

// makes flutterwave airtime payment
exports.makeFlutterwaveAirtimePayment = async (initiateTransferPayload) => {
  setEnvironment();

  console.log("payload");
  console.log(initiateTransferPayload);
  try {
    const initiateTransferResponse = await axios.post(
      `${flutterwave_api_url}/bills`,
      initiateTransferPayload,
      {
        headers: {
          Authorization: `Bearer ${flutterwave_secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (initiateTransferResponse.data.status == "success") {
      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );

      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "paid",
        ref: initiateTransferResponse.data.data.flw_ref,
        receipt: {
          ...(typeof global.chargeAmount !== "undefined" && {
            charge: global.chargeAmount,
          }),
          amount: initiateTransferResponse.data.data.amount,
          date: fireStoreDate,
          receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,
          receivedInto: {
            name: initiateTransferResponse.data.data.phone_number,
            reference: global.triggerDocument.phoneRef,
          },
          recipient: {
            id: global.triggerDocument.claimant.strapID,
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
        critical: true,
      };

      await logErrorInCollection(
        global.triggerDocument.vend,
        global.triggerDocument.claimant.uid,
        global.triggerDocument.subvend,
        data,
        `${timestamp}_paid`
      );
      console.log("Payment success");
      await handleSuccessfulPayment(
        initiateTransferResponse.data.data.flw_ref,
        "Flutterwave"
      );
      return;
    }
    console.log("No error in payment but couldn't verify status");
    return;
  } catch (error) {
    console.log("flutterwave airtime call error");
    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }
    if (
      error.response?.data?.message?.includes("insufficient") ||
      error.response?.data?.message?.includes("Insufficient")
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

    console.log("Airtime payment failed");
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      message: "airtime payment failed",
      timestamp,
      uid: global.triggerDocument.claimant.uid,
      status: 609,
      type: "pay",
      critical: true,
      createdAt: fireStoreDate,
      ref: global.triggerDocument.alias,
    };

    await logErrorInCollection(
      global.triggerDocument.vend,
      global.triggerDocument.claimant.uid,
      global.triggerDocument.subvend,
      errorData,
      `${timestamp}_paid`
    );

    return;
  }
};

const getReloadlyAuthentication = async (audience) => {
  try {
    const authPayload = {
      client_id: reloadly_client_id,
      client_secret: reloadly_secret_key,
      grant_type: "client_credentials",
      audience: audience,
    };
    const authResponse = await axios.post(
      "https://auth.reloadly.com/oauth/token",
      authPayload,
      {
        headers: {
          Authorization: `Bearer ${reloadly_secret_key}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (authResponse.data.access_token) {
      return authResponse.data.access_token;
    }
    console.log("No error in payment but couldn't verify status");
    return;
  } catch (error) {
    console.log("reloadly auth call failed");
    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }
    throw new Error("reloadly auth call failed");
  }
};

exports.makeReloadlyAirtimePayment = async (initiateTransferPayload) => {
  setEnvironment();

  console.log("payload");
  console.log(initiateTransferPayload);
  try {
    const authorization = await getReloadlyAuthentication(
      "https://topups.reloadly.com"
    );
    const initiateTransferResponse = await axios.post(
      `${reloadly_api_url}/topups`,
      initiateTransferPayload,
      {
        headers: {
          Authorization: `Bearer ${authorization}`,
          Accept: "application/com.reloadly.topups-v1+json",
          "Content-Type": "application/json",
        },
      }
    );
    if (initiateTransferResponse.data.transactionId) {
      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 204,
        type: "paid",
        ref: initiateTransferResponse.data.transactionId,
        receipt: {
          ...(typeof global.chargeAmount !== "undefined" && {
            charge: global.chargeAmount,
          }),
          amount: global.triggerDocument.amount,
          date: fireStoreDate,
          receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,
          receivedInto: {
            name: global.triggerDocument.alias,
            reference: global.triggerDocument.phoneRef,
          },
          recipient: {
            id: global.triggerDocument.claimant.strapID,
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
        critical: true,
      };

      await logErrorInCollection(
        global.triggerDocument.vend,
        global.triggerDocument.claimant.uid,
        global.triggerDocument.subvend,
        data,
        `${timestamp}_paid`
      );
      await handleSuccessfulPayment(
        initiateTransferResponse.data.transactionId,
        "Reloadly"
      );
      console.log("Payment success");
      return;
    }
    console.log("No error in payment but couldn't verify status");
    return;
  } catch (error) {
    console.log("Airtime payment failed");
    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      message: "airtime payment failed",
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
      errorData,
      `${timestamp}_paid`
    );

    return;
  }
};
exports.makeReloadlyGiftCardPayment = async (giftCardPayload) => {
  setEnvironment();

  try {
    const authorization = await getReloadlyAuthentication(
      "https://giftcards.reloadly.com"
    );
    const giftCardResponse = await axios.post(
      "https://giftcards.reloadly.com/orders",
      giftCardPayload,
      {
        headers: {
          Authorization: `Bearer ${authorization}`,
          "Content-Type": "application/json",
          Accept: "application/com.reloadly.giftcards-v1+json",
        },
      }
    );
    const redeemGiftCardResponse = await axios.post(
      `https://giftcards.reloadly.com/orders/transactions/${giftCardResponse.data.transactionId}/cards`,
      giftCardPayload,
      {
        headers: {
          Authorization: `Bearer ${authorization}`,
          "Content-Type": "application/json",
          Accept: "application/com.reloadly.giftcards-v1+json",
        },
      }
    );
    if (giftCardResponse.data.transactionId) {
      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "success",
        timestamp,
        uid: global.triggerDocument.claimant.uid,
        status: 200,
        type: "paid",
        ref: giftCardResponse.data.transactionId,
        pinCode: redeemGiftCardResponse.data.pinCode,
        cardNumber: redeemGiftCardResponse.data.cardNumber,
        receipt: {
          ...(typeof global.chargeAmount !== "undefined" && {
            charge: global.chargeAmount,
          }),
          amount: Number(global.triggerDocument.giftCard.amount),
          date: fireStoreDate,
          receiptNo: `${global.triggerDocument.subvend}${global.triggerDocument.vend}`,
          receivedInto: {
            reference: global.triggerDocument.email,
          },
          recipient: {
            id: global.triggerDocument.claimant.strapID,
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
        critical: true,
      };

      await logErrorInCollection(
        global.triggerDocument.vend,
        global.triggerDocument.claimant.uid,
        global.triggerDocument.subvend,
        data,
        `${timestamp}_paid`
      );
      await firestoreDb
        .collection("users")
        .doc(global.triggerDocument.claimant.uid)
        .collection("notifications")
        .add({
          type: "gift_card",
          details: {
            cardNumber: redeemGiftCardResponse.data.cardNumber,
            pinCode: redeemGiftCardResponse.data.pinCode,
            email: global.triggerDocument.email,
            subVendID: global.triggerDocument.subvend,
            vendID: global.triggerDocument.vend,
            createdAt: fireStoreDate,
            claimantUID: global.triggerDocument.claimant.uid,
          },
        });
      await handleSuccessfulPayment(
        giftCardResponse.data.transactionId,
        "Reloadly"
      );
      console.log("Payment success");
      return;
    }
    console.log("No error in payment but couldn't verify status");
    return;
  } catch (error) {
    console.log("gift card payment failed");
    console.log(error.message);
    if (error.response?.data) {
      console.log(error.response?.data);
    }
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      message: "airtime payment failed",
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
      errorData,
      `${timestamp}_paid`
    );

    return;
  }
};
