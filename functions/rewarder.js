const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const crypto = require("crypto");
const ref = realtimeDb.ref();
const {
  handleBankTransmission,
  handleCharityTransmission,
  handleRevendTransmission,
  handleGiftCardTransmission,
  handleMobileMoneyTransmission,
  handleAirtimeTransmission,
} = require("./helpers/transmission");
const {logErrorInCollection} = require("./helpers/shared");

// const {CloudTasksClient} = require("@google-cloud/tasks");

const checkVendActiveStatus = async (vendDocResult) => {
  if (vendDocResult.active) {
    return true;
  }
  return false;
};

const checkVendDocumentHasBeenTampered = async (vendId) => {
  console.log("checking if  vend has been tampered");
  console.log("vendId is " + vendId);
  const vendDoc = await firestoreDb.collection("vends").doc(`${vendId}`).get();
  const vendlyDoc = await firestoreDb
    .collection("vendly")
    .doc("vendinator")
    .collection("vends")
    .doc(vendId)
    .get();
  if (vendDoc.exists) {
    console.log("vend doc exists");
  } else {
    console.log("vend doc doesn't exist");
  }
  if (vendlyDoc.exists) {
    console.log("vendly doc exists");
  } else {
    console.log("vendly doc doesn't exist");
  }
  const vendlyDocCreateTime = vendlyDoc.createTime;
  const vendDocUpdateTime = vendDoc.updateTime;
  let timeCheck = vendlyDocCreateTime.isEqual(vendDocUpdateTime);

  if (timeCheck) {
    return {checkResult: false, vendDocUpdateTime, vendlyDocCreateTime};
  }
  return {checkResult: true, vendDocUpdateTime, vendlyDocCreateTime};
};

const handleTransactionDocumentTransmission = async (transmission) => {
  console.log(`transmission is ${transmission}`);

  switch (transmission) {
    case "revend":
      return await handleRevendTransmission();
    case "bank":
      return await handleBankTransmission();
    case "charity":
      return await handleCharityTransmission();
    case "giftCard":
      return await handleGiftCardTransmission();
    case "MM":
      return await handleMobileMoneyTransmission();
    case "airtime":
      return await handleAirtimeTransmission();

    default:
      throw Error(`${transmission} is an invalid transmission type`);
  }
};

const checkVendSessionStatusIsWon = async (vendId, claimantId) => {
  const vendSessionDoc = await firestoreDb
    .collection("vends")
    .doc(vendId)
    .collection("sessions")
    .doc(claimantId)
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
    .doc(vendId)
    .collection("straps")
    .doc("meta")
    .collection(strapType)
    .doc(strapId)
    .get();
  if (!strapDoc.exists) {
    return false;
  }
  return true;
};
const checkForValueOfIsWonInUserStrap = async (strapType, strapId, vendId) => {
  const strapDoc = await firestoreDb
    .collection("vends")
    .doc(vendId)
    .collection("straps")
    .doc("meta")
    .collection(strapType)
    .doc(strapId)
    .get();
  const strapData = strapDoc.data();

  return strapData.isWon;
};

const runtimeOpts = {
  timeoutSeconds: 300,
  memory: "2GB",
};

exports.rewarder = functions
  .runWith(runtimeOpts)
  .firestore.document(
    "vends/{vendID}/sessions/{userID}/subVend/{subVendID}/states/acccepted"
  )
  .onCreate(async (snap, context) => {
    console.log("Rewarder started");
    const rewardDocument = snap.data();

    global.userId = context.params.userID;
    global.vendId = context.params.vendID;
    global.subvendId = context.params.subVendId;
    const hashData = `${global.userId}${global.vendId}`;

    const booleanObjectId = crypto
      .createHash("sha256")
      .update(hashData)
      .digest("hex");
    console.log("boolean id " + booleanObjectId);

    global.booleanObjectId = booleanObjectId;
    const booleanObjectRef = ref.child(
      `vends/${global.vendId}/knocks/attempts/${booleanObjectId}/subvend/backend`
    );
    global.booleanObjectRef = booleanObjectRef;

    console.log("boolean id " + booleanObjectId);
    try {
      const booleanRef = await booleanObjectRef.once("value");
      const booleanObject = booleanRef.val();

      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );

      if (booleanObject.boolean) {
        console.log("Boolean true");
        console.log("Boolean value = " + booleanObject.boolean);

        if (booleanObject.time < 60) {
          await global.booleanObjectRef.update({
            boolean: false,
            time: timestamp,
          });
        } else {
          const data = {
            message: "task currently running.try again later",
            timestamp,
            uid: global.userId,
            status: 800,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            global.triggerDocument.vend,
            global.triggerDocument.claimant.uid,
            global.triggerDocument.subvend,
            data,
            `${timestamp}_rewarder`
          );
        }

        return;
      }

      console.log("Boolean False");
      console.log("Boolean value = " + booleanObject.boolean);
      await global.booleanObjectRef.update({boolean: true, time: timestamp});

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
          errorData,
          `${timestamp}_paid`
        );
        await booleanObjectRef.update({boolean: false});

        console.log("Vend no longer active");
        return;
      }
      console.log("Vend Active!");
      if (vendDocResult.type == "gift" || vendDocResult.type == "money") {
        const userInStrap = await checkForUserInStrap(
          transactionDocument.strapType,
          transactionDocument.claimant.strapID,
          transactionDocument.vend
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
          transactionDocument.vend
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
      }
      const vendDocumentTampered = await checkVendDocumentHasBeenTampered(
        transactionDocument.vend
      );

      if (vendDocumentTampered.checkResult) {
        const formattedVenDocDate =
          vendDocumentTampered.vendDocUpdateTime.toDate();
        const formattedVendlyDocDate =
          vendDocumentTampered.vendlyDocCreateTime.toDate();
        console.log("vend has been tampered with");
        console.log({
          vendDocUpdateTime: formattedVenDocDate,
          vendlyCreateTime: formattedVendlyDocDate,
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
          .doc(transactionDocument.claimant.uid)
          .collection("myVends")
          .doc("created")
          .collection("vends")
          .doc(transactionDocument.vend)
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
      const formattedVenDocDate =
        vendDocumentTampered.vendDocUpdateTime.toDate();
      const formattedVendlyDocDate =
        vendDocumentTampered.vendlyDocCreateTime.toDate();
      console.log("vend has not been tampered with");
      console.log({
        vendDocUpdateTime: formattedVenDocDate,
        vendlyCreateTime: formattedVendlyDocDate,
      });
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
        console.log("Vendsession is NOT equal to won");
        await booleanObjectRef.update({boolean: false});
        return;
      }

      console.log("Vendession status = won");

      await handleTransactionDocumentTransmission(
        transactionDocument.transmission
      );
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
      console.log("Unknown error occured");
      console.log(error);

      return;
    }
  });
