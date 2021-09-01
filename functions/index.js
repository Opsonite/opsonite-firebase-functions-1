const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const realtimeDb = admin.database();
const pay = require("./pay");
const rewarder = require("./rewarder");
const createTransactionDoc = require("./createTransactionDoc");
const createRewardDoc = require("./createRewardDoc");
const ref = realtimeDb.ref();
const discountRef = ref.child("discountCodes");
const {CloudTasksClient} = require("@google-cloud/tasks");

const checkForPositiveAmount = (newDiscount) => {
  if (
    parseInt(newDiscount.amount) == newDiscount.amount &&
    newDiscount.amount > 0
  ) {
    return newDiscount.amount;
  }
  return 1000;
};
const checkForPositiveExpiry = (newDiscount) => {
  if (
    parseInt(newDiscount.expiry) == newDiscount.expiry &&
    newDiscount.expiry > 0
  ) {
    return newDiscount.expiry;
  }
  return 12;
};
const checkEligibilityArray = (eligibility) => {
  if (!eligibility) {
    return {
      id: "@bobnzelu",
      type: "twitter",
    };
  }

  if (!eligibility.id) {
    eligibility.id = "@bobnzelu";
  }
  if (!eligibility.type) {
    eligibility.type = "twitter";
  }
  return eligibility;
};

const deleteCode = async (fireStoreDocPath, fireStoreId) => {
  const fireStoreDocumentRef = admin.firestore().doc(fireStoreDocPath);
  const fireStoreDocument = await admin.firestore().doc(fireStoreDocPath).get();
  if (fireStoreDocument.exists) {
    await fireStoreDocumentRef.update({live: false});
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
exports.taskCallBack = functions.https.onRequest(async (req, res) => {
  const payload = req.body;
  try {
    await deleteCode(payload.docPath, payload.id);

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

exports.discountFunction = functions.firestore
  .document("vendly/discountCodes/codes/{discountCode}")
  .onCreate(async (snap, context) => {
    const newDiscount = snap.data();

    newDiscount.amount = checkForPositiveAmount(newDiscount);
    newDiscount.eligibility = checkEligibilityArray(newDiscount.eligibility);
    newDiscount.currency = "NGN";
    newDiscount.live = true;
    newDiscount.code = context.params.discountCode;
    newDiscount.expiry = checkForPositiveExpiry(newDiscount);
    const todaysDate = new Date(Date.now());

    const formattedDate = `${todaysDate.getDate()}/
    ${todaysDate.getMonth() + 1}
  /${todaysDate.getFullYear()}`;
    newDiscount.createdAt = formattedDate;

    await discountRef.push().set({
      code: context.params.discountCode,
    });

    const project = "document-test-649cd";
    const location = "us-central1";
    const queue = "document-queue";

    const tasksClient = new CloudTasksClient();
    const queuePath = tasksClient.queuePath(project, location, queue);
    const docPath = snap.ref.path;
    const url = `https://${location}-${project}.cloudfunctions.net/taskCallBack`;

    const expiryInMinutes = parseInt(newDiscount.expiry * 60);
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + expiryInMinutes);
    const payload = {id: context.params.discountCode, docPath};
    const task = {
      httpRequest: {
        httpMethod: "POST",
        url,
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        headers: {
          "Content-Type": "application/json",
        },
      },
      scheduleTime: {
        seconds: expiryDate / 1000,
      },
    };
    await snap.ref.update(newDiscount);
    await tasksClient.createTask({
      parent: queuePath,
      task,
    });
  });

exports.pay = pay.pay;
exports.rewarder = rewarder.rewarder;
exports.createTransactionDoc = createTransactionDoc.createTransactionDoc;
exports.createRewardDoc = createRewardDoc.createRewardDoc;
exports.onDeleteCode = functions.firestore
  .document("vendly/discountCodes/codes/{discountCode}")
  .onDelete(async (snap, context) => {
    const fireStoreId = context.params.discountCode;
    const query = ref
      .child("discountCodes")
      .orderByChild("code")
      .equalTo(fireStoreId);
    query.once("value", (snapshot) => {
      snapshot.forEach((childSnapshot) => {
        const childKey = childSnapshot.key;
        const childData = childSnapshot.val();
        if (childData.code === fireStoreId) {
          ref.child(`discountCodes/${childKey}`).remove();
        }
      });
    });
  });
