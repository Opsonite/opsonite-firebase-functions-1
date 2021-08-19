const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestoreDb = admin.firestore();
const crypto = require("crypto");

exports.createTransactionDoc = functions.https.onRequest(async (req, res) => {
  try {
    console.log(req.query);
    const hashData = `${req.query.uid}${req.query.vend}`;

    const booleanObjectId = crypto
      .createHash("sha256")
      .update(hashData)
      .digest("hex");
    console.log("boolean id " + booleanObjectId);
    const docObject = {
      amount: req.query.amount ? req.query.amount : "",
      author: req.query.author ? req.query.author : "",
      live: req.query.live ? !!req.query.live : "",
      claimant: {
        strapID: req.query.strapId ? req.query.strapId : "",
        uid: req.query.uid ? req.query.uid : "",
      },
      strapType: req.query.strapType ? req.query.strapType : "",
      twitter: {
        tid: req.query.tid ? req.query.tid : "",
        handle: req.query.handle ? req.query.handle : "",
      },
      concat: booleanObjectId,
      subvend: req.query.subvend ? req.query.subvend : "",
      uid: req.query.uid ? req.query.uid : "",
      vend: req.query.vend ? req.query.vend : "",
    };
    await firestoreDb
      .collection("transactions")
      .doc("payouts")
      .collection("records")
      .add(docObject);
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});
