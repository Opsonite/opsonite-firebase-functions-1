const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const ref = realtimeDb.ref();
const {CloudTasksClient} = require("@google-cloud/tasks");
const axios = require("axios");

const loadAllData = async () => {
  const promises = [];

  //   defaultCurrencyDoc
  promises.push(
    firestoreDb.collection("vends").doc(global.triggerDocument.vend).get()
  );

  try {
    const results = await Promise.all(promises);

    global.defaultCurrencyDoc = results[0];
  } catch (error) {
    console.log("Error resolving database promise");
    throw Error(error);
  }
};

const createEligibilityDocs = async () => {
  const batch = firestoreDb.batch();

  global.discountData.beneficiaries.forEach((beneficiary) => {
    const eligibilityRef = firestoreDb
      .collection("vendly")
      .doc("discountCodes")
      .collection("codes")
      .doc(global.discountId)
      .collection("eligibility")
      .doc(beneficiary);

    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );

    const data = {
      beneficiary: {
        handle: global.beneficiaryMap[beneficiary],
        id: beneficiary,
        type: "twitter",
      },
      code: {
        amount: global.discountData.amount,
        currency: global.discountData.currency,
        name: global.discountData.code,
      },
      createdAt: fireStoreDate,
      used: {
        boolean: false,
        time: fireStoreDate,
      },
      vid: null,
    };
    batch.set(eligibilityRef, data);
  });

  await batch.commit();
};

const writeToLog = async (data) => {
  // Writes data to discount log
  return await firestoreDb
    .collection("vendly")
    .doc("discountCodes")
    .collection("")
    .doc(global.discountId)
    .collection("logs")
    .set(data);
};

const createDocumentInRtd = async () => {
  await ref.child(`discountCodes/${global.discountData.code}`).set({
    amount: global.discountData.amount,
    currency: global.discountData.currency,
    isUsed: false,
    domain: global.discountData.domain,
    expiry: global.discountExpiryTime.getTime(),
  });
};
const setDefaultFields = () => {
  if (
    !global.discountData.expiry ||
    isNaN(global.discountData.expiry) ||
    !Number.isInteger(global.discountData.expiry)
  ) {
    global.discountData.expiry = 12;
  }
  const timestamp = Date.now();
  const fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
  global.discountData.createdAt = fireStoreDate;
  global.discountData.code = `${global.discountId}`.toLocaleUpperCase();
  global.discountData.live = true;
};

const validateFrontEndDataFields = async () => {
  // check if discount data only has allowed fields
  const allowedFields = [
    "currency",
    "beneficiaries",
    "domain",
    "amount",
    "expiry",
    "vend",
  ];

  for (const property in global.discountData) {
    const timestamp = Date.now();
    const logData = {
      timestamp,
      issuer: "discount",
      message: "invalid currency",
      status: 103,
    };
    await writeToLog(logData);
    if (!allowedFields.includes(property)) {
      throw Error(`${property} is not an allowed field in discount data`);
    }
  }
  return;
};

const deleteCollection = async (db, collectionPath, batchSize) => {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
};

const deleteQueryBatch = async (db, query, resolve) => {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    // When there are no documents left, we are done
    resolve();
    return;
  }

  // Delete documents in a batch
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  // Recurse on the next process tick, to avoid
  // exploding the stack.
  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
};

const createLinkDocument = async () => {
  const timestamp = Date.now();
  const fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
  let expiryTime = new Date(Date.now());

  const expiryDateFormatted = admin.firestore.Timestamp.fromDate(expiryTime);

  expiryTime.setHours(
    expiryTime.getHours() + Number(global.discountData.expiry)
  );

  global.discountExpiryTime = expiryTime;
  const imgRef = await firestoreDb
    .collection("vendly")
    .doc("discountCodes")
    .collection(`${global.discountData.vend.currency}_images`)
    .doc(global.discountData.amount)
    .get();
  let img;
  if (!imgRef.exists()) {
    img = global.discountData.vend.image;
  }

  const imgData = imgRef.data();
  img = imgData.URL;
  const data = {
    code: global.discountData.code,
    createdAt: fireStoreDate,
    expiry: expiryTime.getTime(),
    vend: {
      currency: global.discountData.currency,
      image: global.discountData.vend.image,
      phoneStraps: global.discountData.vend.phoneStraps,
      recipients: global.discountData.vend.recipients,
      slice: global.discountData.vend.slice,
      tweakable: `${global.discountData.vend.tweakable}`,
      twitterStraps: global.discountData.vend.twitterStraps,
      type: global.discountData.vend.type
        ? global.discountData.vend.type
        : "gift",
    },

    vendly: {
      discount: {
        active: {
          description: ` This expires on ${expiryDateFormatted}`,
          facebookIMG: img,
          formFactore: "large",
          imageURL: img,
          isNext: true,
          redirect: {
            baseURL: `https://vendly.com/create/${global.discountId}`,
            params: {
              currency: global.discountData.vend.currency,
              expiry: global.discountData.expiry,
              image: img,
              phoneStraps: global.discountData.vend.phoneStraps,
              recipients: global.discountData.vend.recipients,
              slice: global.discountData.vend.slice,
              tweakable: `${global.disocuntData.vend.tweakable}`,
              twitterStraps: global.discountData.vend.twitterStraps,
              type: global.discountData.vend.type,
            },
          },
          title: `${global.discountId}-${
            global.discountData.defaultCurrencyData[
              global.discountData.currency
            ]
          }-${global.discountData.amount.toLocaleString()} discount voucher from Vendly
          `,
        },
      },
    },
  };
  await firestoreDb
    .collection("links")
    .doc("Discount")
    .collection("metatags")
    .doc(global.discountData.code)
    .set(data);
  return;
};

const validateBeneficiariesWithTwitter = async () => {
  try {
    let twitterIds = "";
    const lastIndex = global.discountData.beneficiaries.length - 1;
    global.discountData.beneficiaries.forEach((beneficiary, index) => {
      if (index === lastIndex) {
        twitterIds.concat(`${beneficiary}`);
        return;
      }
      twitterIds.concat(`${beneficiary},`);
    });

    const verificationResponse = await axios.get(
      `https://api.twitter.com/2/users?ids=${twitterIds}`,
      {
        headers: {
          Authorization: `Bearer ${functions.config.vendly.twitter_bearer_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (verificationResponse.data?.errors) {
      console.log(verificationResponse.data.errors);
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "error verfiying twitter ids",
        status: 108,
      };
      await writeToLog(logData);
      throw Error("Error verifying twitter ids");
    }

    global.data.data.forEach((beneficiary) => {
      global.beneficiaryMap[beneficiary.id] = beneficiary.username;
    });
    return;
  } catch (error) {
    console.log("Error verifying twitter ids");
    const timestamp = Date.now();
    const logData = {
      timestamp,
      issuer: "discount",
      message: "error verfiying twitter ids",
      status: 108,
    };
    await writeToLog(logData);
    throw Error(error);
  }
};

exports.discount = functions.firestore
  .document("vendly/discountCodes/codes/{discountCode}")
  .onCreate(async (snap, context) => {
    global.discountData = snap.data();
    global.discountId = context.params.discountCode;
    await loadAllData();

    if (
      !Number.isInteger(global.discountData.amount) ||
      global.discountData.amount < 0
    ) {
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "invalid amount in discount doc",
        status: 101,
      };
      await writeToLog(logData);
      console.log(
        `invalid amount. Received amount is  ${global.discountData.amount}`
      );
      return;
    }
    if (typeof global.discountData.code !== "undefined") {
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "invalid amount in discount doc",
        status: 102,
      };
      await writeToLog(logData);
      console.log("discount code is defined");
      return;
    }

    global.defaultCurrencyData = global.defaultCurrencyDoc.data();

    if (
      !global.discountData.currency ||
      !(
        `${global.discountData.currency}` in
        global.defaultCurrencyData.currencies
      )
    ) {
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "invalid currency",
        status: 103,
      };
      await writeToLog(logData);
      console.log(
        `invalid currency input. Currency input is ${global.discountData.currency}`
      );
      return;
    }

    if (global.discountData.beneficiaries.length < 1) {
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "No beneficiaries",
        status: 104,
      };
      await writeToLog(logData);
      console.log("No beneficiaries");
      return;
    }
    await validateBeneficiariesWithTwitter();

    if (typeof global.discountData.live !== "undefined") {
      const timestamp = Date.now();
      const logData = {
        timestamp,
        issuer: "discount",
        message: "live is set",
        status: 112,
      };
      await writeToLog(logData);
      console.log("error, live is set");
      return;
    }

    await validateFrontEndDataFields();

    // Vend map validation

    if (global.discountData.vend) {
      if (
        !global.discountData.vend.currency ||
        !(
          `${global.discountData.vend.currency}` in
          global.defaultCurrencyData.currencies
        )
      ) {
        const timestamp = Date.now();
        const logData = {
          timestamp,
          issuer: "discount",
          message: "invalid vend currency",
          status: 113,
        };
        await writeToLog(logData);
        console.log(
          `invalid vend currency input. Currency input is ${global.discountData.vend.currency}`
        );
        return;
      }

      if (
        global.discountData.vend.type == "money" ||
        global.discountData.vend.type == "gift"
      ) {
        if (
          global.discountData.recipients !== null ||
          global.discountData.slice !== null
        ) {
          console.log("recipients or slice in discount data is not null");
          const timestamp = Date.now();
          const logData = {
            timestamp,
            issuer: "discount",
            message: "recipient or slice is not null",
            status: 123,
          };
          await writeToLog(logData);
          return;
        }
        const totalStraps =
          Number(global.discountData.vend.phoneStraps.length) +
          Number(global.discountData.vend.twitterStraps.length);

        await firestoreDb
          .collection("vendly")
          .doc("discountCodes")
          .collection("codes")
          .doc(global.discountId)
          .update({recipients: totalStraps});
      }

      if (global.discountData.vend.type == "supervend") {
        if (
          !global.discountData.vend.recipients ||
          !Number.isInteger(global.discountData.vend.recipients)
        ) {
          console.log("invalid recipient value for supervend");
          const timestamp = Date.now();
          const logData = {
            timestamp,
            issuer: "discount",
            message: "invalid recipient value for supervend",
            status: 183,
          };
          await writeToLog(logData);
          return;
        }
        if (
          !global.discountData.vend.slice ||
          !isNaN(global.discountData.vend.slice)
        ) {
          console.log("invalid slice value for supervend");
          const timestamp = Date.now();
          const logData = {
            timestamp,
            issuer: "discount",
            message: "invalid slice value for supervend",
            status: 193,
          };
          await writeToLog(logData);
          return;
        }
      }
    }

    // handle processing for discount
    setDefaultFields();

    await createEligibilityDocs();

    await createLinkDocument();

    await createDocumentInRtd();

    const project = "opsonite-87ba4";
    const location = "us-central1";
    const queue = "discount-queue";

    const tasksClient = new CloudTasksClient();
    const queuePath = tasksClient.queuePath(project, location, queue);
    const url = `https://${location}-${project}.cloudfunctions.net/deleteCode`;

    const expiryInMinutes = parseInt(global.discountData.expiry * 60);
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + expiryInMinutes);
    const payload = {id: context.params.discountCode};
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

    await tasksClient.createTask({
      parent: queuePath,
      task,
    });
    console.log("function completed");
  });

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

    await deleteCollection(
      firestoreDb.collection(`links/Discount/metags/${fireStoreId}`)
    );
  });
