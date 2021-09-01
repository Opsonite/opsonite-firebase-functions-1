const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestoreDb = admin.firestore();

exports.createRewardDoc = functions.https.onRequest(async (req, res) => {
  try {
    const vaultDocRef = firestoreDb
      .collection("vends")
      .doc(req.query.vend)
      .collection("vault");
    const vaultDoc = await vaultDocRef.get();

    for (const doc of vaultDoc.docs) {
      console.log("doc id " + doc.id);
      if (doc.id !== "funding") {
        console.log("deleting  from vault " + doc.id);
        await doc.ref.delete();
      }
    }

    console.log(req.query);
    const docObject = {
      amount: req.query.amount ? Number(req.query.amount) : "",
      name: req.query.name ? req.query.name : "",
      author: req.query.author ? req.query.author : "",
      charity: req.query.charity ? req.query.charity : "",
      claimant: req.query.claimant ? req.query.claimant : "",

      country: req.query.country ? req.query.country : "",
      remember: req.query.remember ? !!parseInt(req.query.remember) : "",
      isPrimary: req.query.isPrimary ? !!parseInt(req.query.isPrimary) : "",
      alias: req.query.alias ? req.query.alias : "",
      currency: req.query.currency ? req.query.currency : "",
      phoneRef: req.query.phoneRef ? req.query.phoneRef : "",
      createdAt: req.query.createdAt ? req.query.createdAt : "",
      reward: req.query.reward ? req.query.reward : "",
      transmission: req.query.transmission ? req.query.transmission : "",
      transmissionCode: req.query.transmissionCode
        ? req.query.transmissionCode
        : "",
      type: req.query.type ? req.query.type : "",
      giftCard: req.query.giftCard ? req.query.giftCard : "",

      operatorID: req.query.operatorID ? req.query.operatorID : "",

      email: req.query.email ? req.query.email : "",
      defaultCurrency: req.query.defaultCurrency
        ? req.query.defaultCurrency
        : "",

      twitter: {
        tid: req.query.tid ? req.query.tid : "",
        handle: req.query.handle ? req.query.handle : "",
      },
      bank: {
        acctName: req.query.bankAcctName ? req.query.bankAcctName : "",
        branchCode: req.query.bankBranchCode ? req.query.bankBranchCode : "",
        ref: req.query.bankRef ? req.query.bankRef : "",
      },
      subvend: req.query.subvend ? req.query.subvend : "",
      passcode: req.query.passcode ? req.query.passcode : "",
      vend: req.query.vend ? req.query.vend : "",
    };
    console.log(docObject);
    await firestoreDb
      .collection("vends")
      .doc(req.query.vend)
      .collection("sessions")
      .doc(req.query.claimant)
      .collection("subVend")
      .doc(req.query.subvend)
      .collection("states")
      .doc("accepted")
      .delete();
    await firestoreDb
      .collection("vends")
      .doc(req.query.vend)
      .collection("sessions")
      .doc(req.query.claimant)
      .collection("subVend")
      .doc(req.query.subvend)
      .collection("states")
      .doc("accepted")
      .set(docObject);

    res.sendStatus(200);
  } catch (error) {
    console.log(error);
    res.sendStatus(400);
  }
});
