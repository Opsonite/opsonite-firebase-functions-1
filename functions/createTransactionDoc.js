const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestoreDb = admin.firestore();
const realtimeDb = admin.database();
const ref = realtimeDb.ref();

const crypto = require("crypto");

exports.createTransactionDoc = functions.https.onRequest(async (req, res) => {
  try {
    const vaultDocRef = firestoreDb
      .collection("vends")
      .doc(req.query.vend)
      .collection("vault");
    const vaultDoc = await vaultDocRef.get();
    // console.log(vaultDoc);

    for (const doc of vaultDoc.docs) {
      console.log("doc id " + doc.id);
      if (doc.id !== "funding") {
        console.log("deleting  from vault " + doc.id);
        await doc.ref.delete();
      }
    }

    console.log(req.query);
    const hashData = `${req.query.uid}${req.query.vend}`;

    const booleanObjectId = crypto
      .createHash("sha256")
      .update(hashData)
      .digest("hex");
    console.log("boolean id " + booleanObjectId);
    const docObject = {
      amount: req.query.amount ? Number(req.query.amount) : "",
      name: req.query.name ? req.query.name : "",
      author: req.query.author ? req.query.author : "",
      charity: req.query.charity ? req.query.charity : "",
      claimant: {
        strapID: req.query.strapId ? req.query.strapId : "",
        uid: req.query.uid ? req.query.uid : "",
      },

      country: req.query.country ? req.query.country : "",
      alias: req.query.alias ? req.query.alias : "",
      currency: req.query.currency ? req.query.currency : "",
      phoneRef: req.query.phoneRef ? req.query.phoneRef : "",
      raw: req.query.raw ? Number(req.query.raw) : "",
      sessionID: req.query.sessionID ? req.query.sessionID : "",
      transmission: req.query.transmission ? req.query.transmission : "",
      type: req.query.type ? req.query.type : "",
      giftCard: {
        amount: req.query.giftCardAmount
          ? Number(req.query.giftCardAmount)
          : "",
        id: req.query.giftCardId ? req.query.giftCardId : "",
      },
      operatorID: req.query.operatorID ? req.query.operatorID : "",

      domain: req.query.domain ? req.query.domain : "",
      email: req.query.email ? req.query.email : "",
      defaultCurrency: req.query.defaultCurrency
        ? req.query.defaultCurrency
        : "",
      strapType: req.query.strapType ? req.query.strapType : "",

      twitter: {
        tid: req.query.tid ? req.query.tid : "",
        handle: req.query.handle ? req.query.handle : "",
      },
      bank: {
        acctName: req.query.bankAcctName ? req.query.bankAcctName : "",
        branchCode: req.query.bankBranchCode ? req.query.bankBranchCode : "",
        ref: req.query.bankRef ? req.query.bankRef : "",
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
    const booleanObjectRef = ref.child(
      `vends/${req.query.vend}/knocks/attempts/${booleanObjectId}/subvend/backend`
    );
    await booleanObjectRef.update({boolean: true});
    await firestoreDb
      .collection("vends")
      .doc(`${req.query.vend}`)
      .update({active: true});
    const tampered = !!parseInt(req.query.tampered);

    if (tampered) {
      await firestoreDb
        .collection("vendly")
        .doc("vendinator")
        .collection("vends")
        .doc(req.query.vend)
        .delete();
      const batch = firestoreDb.batch();

      const vendlyDocRef = firestoreDb
        .collection("vendly")
        .doc("vendinator")
        .collection("vends")
        .doc(req.query.vend);
      batch.set(vendlyDocRef, {author: "john"});

      const timestamp = Date.now();
      const vendDocRef = firestoreDb
        .collection("vends")
        .doc(`${req.query.vend}`);
      batch.update(vendDocRef, {timestamp: timestamp});

      await batch.commit();
    }
    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});
