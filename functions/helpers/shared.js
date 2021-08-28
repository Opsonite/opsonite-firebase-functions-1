const admin = require("firebase-admin");
const firestoreDb = admin.firestore();
const realtimeDb = admin.database();
const functions = require("firebase-functions");
const axios = require("axios");

const ref = realtimeDb.ref();

exports.logErrorInCollection = async (
  vendId,
  claimantId,
  subvendId,
  data,
  logKey
) => {
  console.log("logging in log collection");
  console.log({vendId, claimantId, subvendId, logKey});
  return await firestoreDb
    .collection("vends")
    .doc(vendId)
    .collection("sessions")
    .doc(claimantId)
    .collection("subVend")
    .doc(subvendId)
    .collection("logs")
    .doc(logKey)
    .set(data);
};
exports.generateRandomNumber = () => {
  return parseInt(Math.floor(Math.random() * 100));
};
exports.handleSuccessfulPayment = async (paymentRef, processorName) => {
  const timestamp = Date.now();
  const fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
  await firestoreDb
    .collection("transactions")
    .doc("payouts")
    .collection("records")
    .doc(global.triggerDocId)
    .update({
      success: {isSuccess: true, ref: paymentRef, successAt: fireStoreDate},
    });

  try {
    const fundingDocRef = firestoreDb
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .collection("vault")
      .doc("funding");
    await firestoreDb.runTransaction(async (t) => {
      const fundingDocData = await t.get(fundingDocRef);

      const updatedInPlay =
        Number(fundingDocData.inPlay) - Number(global.triggerDocument.amount);

      t.update(fundingDocRef, {inPlay: updatedInPlay});
    });
  } catch (e) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const errorData = {
      issuer: "Pay",
      subVendID: global.triggerDocument.subvend,
      vendID: global.triggerDocument.vend,
      createdAt: fireStoreDate,
    };

    await global.booleanObjectRef.update({vendsession: "paid"});

    await firestoreDb
      .collection("vendly")
      .doc("criticalErrors")
      .collection("errors")
      .add(errorData);

    // need to do step c and d

    return;
  }
  await firestoreDb
    .collection("transactions")
    .doc("payouts")
    .collection("records")
    .doc(global.triggerDocId)
    .update({
      processor: {
        ref: paymentRef,
        name: processorName,
        time: fireStoreDate,
      },
    });
  await firestoreDb
    .collection("transactions")
    .doc("payouts")
    .update({
      count: admin.firestore.FieldValue.increment(1),
    });
  await firestoreDb
    .collection("users")
    .doc(global.triggerDocument.claimant.uid)
    .collection("myVends")
    .doc("attempted")
    .update({
      count: admin.firestore.FieldValue.increment(1),
    });
  if (global.triggerDocument.transmission == "airtime") {
    try {
      const authorRef = ref.child(
        `vends/${global.triggerDocument.vend}/public/author/vendle`
      );

      let authorData = await authorRef.once("value");

      const phoneDetails = global.triggerDocument.phoneRef.split("_");
      authorData = authorData.val();
      const smsPayload = {
        id: `vendly-${Date.now()}`,
        to: [phoneDetails[0]],
        sender_mask: "Vendly",
        body: `Hi there, you have just received ${global.triggerDocument.amount} amount of
airtime from ${authorData} through Vendly. Visit
www.vendly.com to find out more.`,
      };
      const smsResponse = await axios.post(
        `https://konnect.kirusa.com/api/v1/Accounts/${
          functions.config().kirusa.account_id
        }/Messages`,
        smsPayload,
        {
          headers: {
            Authorization: `${functions.config().kirusa.api_token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (smsResponse.status == "ok") {
        console.log("Text sent to airtime receiver");
      }
      console.log(" sms api call successful but status not verified ");
    } catch (error) {
      console.log("Text not sent to airtime receiver");
      console.log(error.message);
      if (error.response?.data) {
        console.log(error.response?.data);
      }
    }
    await firestoreDb
      .collection("processors")
      .doc("paystack")
      .collection("transferSuccess")
      .doc(
        `${global.triggerDocument.vend}_${global.triggerDocument.claimant.uid}`
      )
      .set({
        createdAt: fireStoreDate,
      });
  }
  await firestoreDb
    .collection("users")
    .doc(global.triggerDocument.claimant.uid)
    .collection("notifications")
    .add({
      type: "vend_claim",
      details: {
        subVendID: global.triggerDocument.subvend,
        vendID: global.triggerDocument.vend,
        createdAt: fireStoreDate,
        claimantUID: global.triggerDocument.claimant.uid,
        amount: global.triggerDocument.amount,
        authorID: global.triggerDocument.author,
      },
    });
  await firestoreDb
    .collection("users")
    .doc(global.triggerDocument.author)
    .collection("notifications")
    .add({
      type: "vend_claimed",
      details: {
        subVendID: global.triggerDocument.subvend,
        vendID: global.triggerDocument.vend,
        createdAt: fireStoreDate,
        claimantUID: global.triggerDocument.claimant.uid,
        amount: global.triggerDocument.amount,
        authorID: global.triggerDocument.author,
      },
    });
  const vendSessionDoc = await firestoreDb
    .collection("users")
    .doc(global.triggerDocument.claimant.uid)
    .collection("myVends")
    .doc("attempted")
    .collection(global.triggerDocument.type)
    .doc(global.triggerDocument.vend)
    .get();

  if (vendSessionDoc.exists) {
    await firestoreDb
      .collection("users")
      .doc(global.triggerDocument.claimant.uid)
      .collection("myVends")
      .doc("attempted")
      .collection(global.triggerDocument.type)
      .doc(global.triggerDocument.vend)
      .update({
        state: admin.firestore.FieldValue.arrayUnion({
          time: timestamp,
          type: "paid",
        }),
      });
  } else {
    await firestoreDb
      .collection("users")
      .doc(global.triggerDocument.claimant.uid)
      .collection("myVends")
      .doc("attempted")
      .collection(global.triggerDocument.type)
      .doc(global.triggerDocument.vend)
      .set({
        state: [
          {
            time: timestamp,
            type: "paid",
          },
        ],
      });
  }
  const vendSessionRef = ref.child(
    `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend`
  );

  await vendSessionRef.update({status: "paid"});
  await global.booleanObjectRef.update({boolean: false});
  console.log("Function is successful");
};
