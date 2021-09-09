const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
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

const checkVendActiveStatus = async (vendDocResult) => {
  if (vendDocResult.active) {
    return true;
  }
  return false;
};

const loadlAllDocs = async () => {
  const firestorePromises = [];
  const booleanObjectRef = ref.child(
    `vends/${global.triggerDocument.vend}/knocks/attempts/${global.booleanObjectId}/subvend/backend`
  );
  const conversionRef = ref.child(
    `institutions/${global.triggerDocument.defaultCurrency}/exRates/${global.triggerDocument.currency}`
  );
  const authorRef = ref.child(
    `vends/${global.triggerDocument.vend}/public/author/vendle`
  );
  // vendDoc
  firestorePromises.push(
    firestoreDb.collection("vends").doc(global.triggerDocument.vend).get()
  );

  // vendlyDoc
  firestorePromises.push(
    firestoreDb
      .collection("vendly")
      .doc("vendinator")
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .get()
  );

  // vendSessionDoc
  firestorePromises.push(
    firestoreDb
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .collection("sessions")
      .doc(global.triggerDocument.claimant.uid)
      .get()
  );

  // attemptedVendSessionDoc
  firestorePromises.push(
    firestoreDb
      .collection("users")
      .doc(global.triggerDocument.claimant.uid)
      .collection("myVends")
      .doc("attempted")
      .collection(global.triggerDocument.type)
      .doc(global.triggerDocument.vend)
      .get()
  );

  // strapDoc
  firestorePromises.push(
    firestoreDb
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .collection("straps")
      .doc("meta")
      .collection(global.triggerDocument.strapType)
      .doc(global.triggerDocument.claimant.strapID)
      .get()
  );

  // vaultDoc
  firestorePromises.push(
    firestoreDb
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .collection("vault")
      .get()
  );

  // subvendDoc
  firestorePromises.push(
    firestoreDb
      .collection("vends")
      .doc(global.triggerDocument.vend)
      .collection("sessions")
      .doc(global.triggerDocument.claimant.uid)
      .collection("subVend")
      .doc(global.triggerDocument.subvend)
      .get()
  );
  global.subvendRef = firestoreDb
    .collection("vends")
    .doc(global.triggerDocument.vend)
    .collection("sessions")
    .doc(global.triggerDocument.claimant.uid)
    .collection("subVend")
    .doc(global.triggerDocument.subvend);

  // charityDoc;
  firestorePromises.push(
    firestoreDb
      .collection("charities")
      .doc(global.triggerDocument.charity)
      .get()
  );

  // rtd
  firestorePromises.push(booleanObjectRef.once("value"));
  firestorePromises.push(conversionRef.once("value"));
  firestorePromises.push(authorRef.once("value"));

  try {
    const [
      vendDoc,
      vendlyDoc,
      vendSessionDoc,
      attemptedVendSessionDoc,
      strapDoc,
      vaultDoc,
      subvendDoc,
      charityDoc,
      booleanObjectDoc,
      conversionRefDoc,
      authorDoc,
    ] = await Promise.all(firestorePromises);
    global.vendDoc = vendDoc;
    global.vendlyDoc = vendlyDoc;
    global.vendSessionDoc = vendSessionDoc;
    global.attemptedVendSessionDoc = attemptedVendSessionDoc;
    global.strapDoc = strapDoc;
    global.vaultDoc = vaultDoc;
    global.subvendDoc = subvendDoc;
    global.charityDoc = charityDoc;
    global.booleanObjectDoc = booleanObjectDoc;
    global.conversionRefDoc = conversionRefDoc;
    global.booleanObjectDoc = booleanObjectDoc;
    global.conversionRefDoc = conversionRefDoc;
    global.authorDoc = authorDoc;

    global.subvendData = global.subvendDoc.data();
  } catch (error) {
    console.log("error resolving promises");
    throw Error(error);
  }
};

const checkVendDocumentHasBeenTampered = async (vendId) => {
  console.log("checking if  vend has been tampered");
  console.log("vendId is " + vendId);
  const vendDoc = global.vendDoc;
  const vendlyDoc = global.vendlyDoc;
  if (vendDoc.exists) {
    console.log("vend doc exists");
  } else {
    console.log("vend doc doesn't exist");
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

const checkVendSessionStatusIsWon = async () => {
  const vendSessionDoc = global.vendSessionDoc;

  const vendSessionDocData = vendSessionDoc.data();

  if (vendSessionDocData.state == "won") {
    return true;
  }
  return false;
};
const checkForUserInStrap = async () => {
  if (!global.strapDoc.exists) {
    return false;
  }
  return true;
};
const checkForValueOfIsWonInUserStrap = async () => {
  const strapData = global.strapDoc.data();

  return strapData.isWon;
};

const runtimeOpts = {
  timeoutSeconds: 300,
  memory: "2GB",
};

exports.pay = functions
  .runWith(runtimeOpts)
  .firestore.document("transactions/payouts/records/{trigger}")
  .onCreate(async (snap, context) => {
    const transactionDocument = snap.data();
    global.triggerDocId = context.params.trigger;

    global.triggerDocument = transactionDocument;
    const booleanObjectId = transactionDocument.concat;
    global.booleanObjectId = booleanObjectId;
    await loadlAllDocs();

    const booleanObjectRef = ref.child(
      `vends/${transactionDocument.vend}/knocks/attempts/${booleanObjectId}/subvend/backend`
    );
    global.booleanObjectRef = booleanObjectRef;

    console.log("boolean id " + booleanObjectId);
    try {
      console.log("checking vend doc");
      console.log(global.vendDoc);
      const vendDocResult = global.vendDoc.data();
      global.vendDocData = vendDocResult;

      const booleanRef = global.booleanObjectDoc;
      const booleanObject = booleanRef.val();
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
          errorData,
          `${timestamp}_paid`
        );

        console.log("Boolean False.Unable to proceed");
        console.log("Boolean value = " + booleanObject.boolean);
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
          errorData,
          `${timestamp}_paid`
        );
        await booleanObjectRef.update({boolean: false});

        console.log("Vend no longer active");
        return;
      }
      console.log("Vend Active!");
      if (vendDocResult.type == "gift" || vendDocResult.type == "money") {
        const userInStrap = await checkForUserInStrap();

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
        const strapIsWonValue = await checkForValueOfIsWonInUserStrap();

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
      const vendSessionStatusCheck = await checkVendSessionStatusIsWon();

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
