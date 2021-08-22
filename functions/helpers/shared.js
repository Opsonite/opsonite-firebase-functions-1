const admin = require("firebase-admin");
const firestoreDb = admin.firestore();

exports.logErrorInCollection = async (
  vendId,
  claimantId,
  subvendId,
  data,
  logKey = null
) => {
  if (!logKey) {
    return await firestoreDb
      .collection("vends")
      .doc(vendId)
      .collection("sessions")
      .doc(claimantId)
      .collection("subVend")
      .doc(subvendId)
      .collection("logs")
      .add(data);
  }
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
