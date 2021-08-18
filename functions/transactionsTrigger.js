const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
// const {CloudTasksClient} = require("@google-cloud/tasks");
const crypto = require("crypto");

const logErrorInCollection = async (
  vendId,
  claimantId,
  subvendId,
  data,
  logKey = null
) => {
  if (!logKey) {
    console.log("writng to sub collection");
    console.log({vendId, claimantId, subvendId});
    return await firestoreDb
      .collection("vends")
      .doc(vendId)
      .collection("sessions")
      .doc(claimantId)
      .collection("subvends")
      .doc(subvendId)
      .collection("logs")
      .add(data);
  }
  return await firestoreDb
    .collection("vends")
    .doc(vendId)
    .collection("sessions")
    .doc(claimantId)
    .collection("subvends")
    .doc(subvendId)
    .collection("logs")
    .doc(logKey)
    .set(data);
};
const checkVendActiveStatus = async (vendDocResult) => {
  if (vendDocResult.active) {
    return true;
  }
  return false;
};

const checkVendDocumentHasBeenTampered = async (vendId) => {
  const vendDoc = await firestoreDb.collection("vends").doc(`${vendId}`).get();
  const vendlyDoc = await firestoreDb
    .collection("vendly")
    .doc(`vendinator/vends/${vendId}`)
    .get();
  const vendlyDocCreateTime = vendlyDoc.createTime;
  const vendDocUpdateTime = vendDoc.updateTime;

  if (vendDocUpdateTime == vendlyDocCreateTime) {
    return {checkResult: false, vendDocUpdateTime, vendlyDocCreateTime};
  }
  return {checkResult: true, vendDocUpdateTime, vendlyDocCreateTime};
};

const checkVendSessionStatusIsWon = async (vendId, claimantId) => {
  const vendSessionDoc = await firestoreDb
    .collection("vends")
    .doc(`${vendId}/sessions/${claimantId}`)
    .get();
  const vendSessionDocData = vendSessionDoc.data();

  if (vendSessionDocData.state == "won") {
    return true;
  }
  return false;
};
const checkForUserInStrap = async (strapType, strapId, vendId) => {
  const strapDoc = await firestoreDb
    .collection("vends")
    .doc(`${vendId}/straps/meta/${strapType}/${strapId}`)
    .get();
  if (!strapDoc.exists) {
    return false;
  }
  return true;
};
const checkForValueOfIsWonInUserStrap = async (strapType, strapId, vendId) => {
  const strapDoc = await firestoreDb
    .collection("vends")
    .doc(`${vendId}/straps/meta/${strapType}/${strapId}`)
    .get();
  const strapData = strapDoc.data();

  return strapData.isWon;
};

exports.transactionsTrigger = functions.firestore
  .document("transactions/payouts/records/{trigger}")
  .onCreate(async (snap) => {
    const transactionDocument = snap.data();

    const booleanObjectId = crypto
      .createHash("sha256")
      .update(`${transactionDocument.claimant.uid}${transactionDocument.vend}`)
      .digest("hex");
    const booleanObjectRef = ref.child(
      `vends/${transactionDocument.vend}}/knocks/attempts/${booleanObjectId}/subvend/backend`
    );

    console.log("boolean id " + booleanObjectId);
    try {
      const vendDoc = await firestoreDb
        .collection("vends")
        .doc(`${transactionDocument.vend}`)
        .get();
      const vendDocResult = vendDoc.data();

      booleanObjectRef.once("value", async (snapshot) => {
        const booleanObject = snapshot.val();
        if (!booleanObject.boolean) {
          const timestamp = Date.now();
          const fireStoreDate = admin.firestore.Timestamp.fromDate(
            new Date(timestamp)
          );
          const errorData = {
            message: "Boolean False.Unable to proceed",
            timestamp,
            uid: transactionDocument.claimant.uid,
            status: 600,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            transactionDocument.vend,
            transactionDocument.claimant.uid,
            transactionDocument.subvend,
            errorData
          );

          console.log("Boolean False.Unable to proceed");
          return;
        }
        console.log("Boolean True");
        const vendActiveStatus = await checkVendActiveStatus(vendDocResult);
        if (!vendActiveStatus) {
          const timestamp = Date.now();
          const fireStoreDate = admin.firestore.Timestamp.fromDate(
            new Date(timestamp)
          );
          const errorData = {
            message: "Vend inactive",
            timestamp,
            uid: transactionDocument.claimant.uid,
            status: 608,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            transactionDocument.vend,
            transactionDocument.claimant.uid,
            transactionDocument.subvend,
            errorData
          );
          console.log("Vend no longer active");
          return;
        }
        console.log("Vend Active!");
        if (vendDocResult.type == "gift" || vendDocResult.type == "money") {
          const userInStrap = await checkForUserInStrap(
            transactionDocument.strapType,
            transactionDocument.claimant.strapID,
            transactionDocument.subvend
          );

          if (!userInStrap) {
            const timestamp = Date.now();
            const fireStoreDate = admin.firestore.Timestamp.fromDate(
              new Date(timestamp)
            );
            const errorData = {
              message: "Strap mismatch",
              timestamp,
              uid: transactionDocument.claimant.uid,
              status: 605,
              critical: true,
              createdAt: fireStoreDate,
            };

            await logErrorInCollection(
              transactionDocument.vend,
              transactionDocument.claimant.uid,
              transactionDocument.subvend,
              errorData,
              `${timestamp}_pay`
            );
            console.log("User not found in straps");
            await booleanObjectRef.update({boolean: false});
            return;
          }
          const strapIsWonValue = await checkForValueOfIsWonInUserStrap(
            transactionDocument.strapType,
            transactionDocument.claimant.strapID,
            transactionDocument.subvend
          );

          if (strapIsWonValue) {
            console.log("User has already won");
            const timestamp = Date.now();
            const fireStoreDate = admin.firestore.Timestamp.fromDate(
              new Date(timestamp)
            );
            const errorData = {
              message: "User already won",
              timestamp,
              uid: transactionDocument.claimant.uid,
              status: 704,
              critical: true,
              createdAt: fireStoreDate,
            };

            await logErrorInCollection(
              transactionDocument.vend,
              transactionDocument.claimant.uid,
              transactionDocument.subvend,
              errorData,
              `${timestamp}_pay`
            );
            await firestoreDb
              .collection("vends")
              .doc(`${transactionDocument.vendId}`)
              .collection("sessions")
              .doc(transactionDocument.claimant.uid)
              .update({state: "closed"});
            await booleanObjectRef.update({boolean: false});
            return;
          }
          console.log("User has not yet won");
          const vendDocumentTampered = await checkVendDocumentHasBeenTampered(
            transactionDocument.vend
          );

          if (vendDocumentTampered.checkResult) {
            console.log({
              vendDocUpdateTime: vendDocumentTampered.vendDocUpdateTime,
              vendlyCreateTime: vendDocumentTampered.vendlyDocCreateTime,
            });
            const timestamp = Date.now();
            const fireStoreDate = admin.firestore.Timestamp.fromDate(
              new Date(timestamp)
            );
            const errorData = {
              message: "Vend has been tampered with",
              timestamp,
              uid: transactionDocument.claimant.uid,
              status: 606,
              critical: true,
              createdAt: fireStoreDate,
            };

            await logErrorInCollection(
              transactionDocument.vend,
              transactionDocument.claimant.uid,
              transactionDocument.subvend,
              errorData,
              `${timestamp}_pay`
            );
            await firestoreDb
              .collection("vends")
              .doc(`${transactionDocument.vend}`)
              .update({active: false});
            await firestoreDb
              .collection("vends")
              .doc(`${transactionDocument.vend}`)
              .update({
                state: admin.firestore.FieldValue.arrayUnion({
                  time: timestamp,
                  type: "closed",
                }),
              });
            await firestoreDb
              .collection("users")
              .doc(
                `${transactionDocument.claimant.uid}/myVends/created/vends/${transactionDocument.vend}`
              )
              .update({
                state: admin.firestore.FieldValue.arrayUnion({
                  date: fireStoreDate,
                  type: "deactivated",
                  issuer: "pay",
                }),
              });
            await booleanObjectRef.update({boolean: false});
            return;
          }
          const vendSessionStatusCheck = await checkVendSessionStatusIsWon(
            transactionDocument.vend,
            transactionDocument.claimant.uid
          );

          if (!vendSessionStatusCheck) {
            const timestamp = Date.now();
            const fireStoreDate = admin.firestore.Timestamp.fromDate(
              new Date(timestamp)
            );
            const errorData = {
              message: "Session ineligible",
              timestamp,
              uid: transactionDocument.claimant.uid,
              status: 607,
              critical: true,
              createdAt: fireStoreDate,
            };

            await logErrorInCollection(
              transactionDocument.vend,
              transactionDocument.claimant.uid,
              transactionDocument.subvend,
              errorData,
              `${timestamp}_pay`
            );
          }
          console.log("Vendsession is NOT equal to won");
          await booleanObjectRef.update({boolean: false});
          return;
        }
      });
    } catch (error) {
      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const errorData = {
        message: "Unknown error",
        timestamp,
        uid: transactionDocument.claimant.uid,
        // eslint-disable-next-line no-octal
        status: 000,
        critical: true,
        createdAt: fireStoreDate,
      };

      await logErrorInCollection(
        transactionDocument.vend,
        transactionDocument.claimant.uid,
        transactionDocument.subvend,
        errorData,
        `${timestamp}_pay`
      );
      await booleanObjectRef.update({boolean: false});
      return;
    }
  });
