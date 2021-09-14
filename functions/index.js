const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const realtimeDb = admin.database();
const pay = require("./pay");
const discount = require("./discount");
const rewarder = require("./rewarder");
const createTransactionDoc = require("./createTransactionDoc");
const createRewardDoc = require("./createRewardDoc");
const ref = realtimeDb.ref();
const firestoreDb = admin.firestore();

const deleteCode = async (fireStoreId) => {
  const fireStoreDocument = await firestoreDb
    .collection("venldy")
    .doc("discountCodes")
    .collection("codes")
    .doc(fireStoreId)
    .get();
  if (fireStoreDocument.exists) {
    await firestoreDb
      .collection("venldy")
      .doc("discountCodes")
      .collection("codes")
      .doc(fireStoreId)
      .update({live: false});
  }

  const newlyCreatedDocRef = ref
    .child("discountCodes")
    .orderByChild("code")
    .equalTo(fireStoreId);
  newlyCreatedDocRef.once("value", (snapshot) => {
    snapshot.forEach((childSnapshot) => {
      const childKey = childSnapshot.key;
      const childData = childSnapshot.val();
      if (childData.code === fireStoreId) {
        ref.child(`discountCodes/${childKey}`).remove();
      }
    });
  });
  return;
};

// http callable function (adding a request)
exports.deleteCode = functions.https.onRequest(async (req, res) => {
  const payload = req.body;
  try {
    await deleteCode(payload.id);

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

exports.discount = discount.discount;
exports.pay = pay.pay;
exports.rewarder = rewarder.rewarder;
exports.createTransactionDoc = createTransactionDoc.createTransactionDoc;
exports.createRewardDoc = createRewardDoc.createRewardDoc;
exports.onDeleteCode = discount.onDeleteCode;
