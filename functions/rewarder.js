const functions = require("firebase-functions");
const admin = require("firebase-admin");
const realtimeDb = admin.database();
const firestoreDb = admin.firestore();
const crypto = require("crypto");
const ref = realtimeDb.ref();
// const {
//   handleBankTransmission,
//   handleCharityTransmission,
//   handleRevendTransmission,
//   handleGiftCardTransmission,
//   handleMobileMoneyTransmission,
//   handleAirtimeTransmission,
// } = require("./helpers/transmission");
const {logErrorInCollection} = require("./helpers/shared");

// const {CloudTasksClient} = require("@google-cloud/tasks");

const dataValidationPassed = async () => {
  const states = {
    MM: {
      defaultValues: {
        isPrimary: true,
        remember: true,
        transmission: "MM",
        type: "accepted",
      },
      fields: [
        "claimant",
        "country",
        "createdAt",
        "isPrimary",
        "name",
        "passcode",
        "phoneRef",
        "remember",
        "transmission",
        "transmissionCode",
        "type",
      ],
    },
    airtime: {
      defaultValues: {
        isPrimary: false,
        transmission: "airtime",
        type: "accepted",
      },
      fields: [
        "claimant",
        "country",
        "currency",
        "createdAt",
        "isPrimary",
        "operatorID",
        "passcode",
        "phoneRef",
        "name",
        "passcode",
        "remember",
        "transmission",
        "transmissionCode",
        "type",
      ],
    },
    bank: {
      defaultValues: {
        isPrimary: true,
        transmission: "bank",
        remember: false,
        type: "accepted",
      },
      nestedFields: {
        bank: ["acctName", "ref"],
      },
      fields: [
        "bank",
        "claimant",
        "country",
        "currency",
        "createdAt",
        "isPrimary",
        "operatorID",
        "passcode",
        "passcode",
        "remember",
        "transmission",
        "transmissionCode",
        "type",
      ],
    },
    charity: {
      defaultValues: {
        transmission: "charity",
        type: "accepted",
      },

      fields: [
        "charity",
        "claimant",
        "createdAt",
        "passcode",
        "passcode",
        "transmission",
        "transmissionCode",
        "type",
      ],
    },
    giftCard: {
      defaultValues: {
        transmission: "giftCard",
        type: "accepted",
      },

      fields: [
        "claimant",
        "email",
        "createdAt",
        "giftCard",
        "transmission",
        "transmissionCode",
        "type",
      ],
    },
    revend: {
      defaultValues: {
        transmission: "revend",
        type: "accepted",
      },
      nestedFields: {
        twitter: ["handle", "tid"],
      },

      fields: [
        "claimant",
        "country",
        "createdAt",
        "passcode",
        "twitter",
        "transmissionCode",
        "transmission",
        "type",
      ],
    },
  };

  let error = false;
  states[global.rewardDocument.transmission].fields.forEach((field) => {
    if (!(field in global.rewardDocument)) {
      console.log(`data validation failed, ${field} is not in reward doc`);
      error = true;
    }
    if (
      states[global.rewardDocument.transmission]["defaultValues"][field] &&
      states[global.rewardDocument.transmission]["defaultValues"][field] !=
        global.rewardDocument[field]
    ) {
      console.log(`data validation failed for ${field}, data not equal`);

      console.log("expected value ");
      console.log(global.rewardDocument[field]);
      console.log("value we got");
      console.log(
        states[global.rewardDocument.transmission]["defaultValues"][field]
      );

      error = true;
    }
  });
  if (!error) {
    console.log("data validation passed");
    return true;
  } else {
    console.log("data validation failed");
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Data validation failed",
      timestamp,
      uid: global.userId,
      status: 801,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return false;
  }
};
const charityValidationPassed = async () => {
  const charityObject = await firestoreDb
    .collection("charities")
    .doc(global.rewardDocument.charity)
    .get();
  let charityData;
  if (charityObject.exists) {
    charityData = charityObject.data();
  }
  if (
    charityData.country != global.rewardDocument.country ||
    charityData.currency != global.rewardDocument.currency
  ) {
    console.log("charity country " + charityData.country);
    console.log("charity currency " + charityData.currency);
    console.log("reward country " + global.rewardDocument.country);
    console.log("reward currency " + global.rewardDocument.currency);
    return false;
  }
  return true;
};
const giftCardValidationPassed = async () => {
  const subvendDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId)
    .get();
  const subvendData = subvendDoc.data();

  if (
    subvendData.giftCard?.currency != global.rewardDocument.currency ||
    subvendData.giftCard?.country != global.rewardDocument.country ||
    subvendData.giftCard?.amount != global.rewardDocument.amount
  ) {
    console.log("giftcard country " + subvendData.giftCard?.country);
    console.log("giftcard currency " + subvendData.giftCard?.currency);
    console.log("giftcard amount " + subvendData.giftCard?.amount);
    console.log("reward currency " + global.rewardDocument.currency);
    console.log("reward amount " + global.rewardDocument.amount);
    console.log("reward country " + global.rewardDocument.country);
    return false;
  }
  return true;
};
const setTriggerObject = async () => {
  console.log("settng trigger object");
  const subvendDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId)
    .get();
  const subvendData = subvendDoc.data();
  const resolveDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId)
    .collection("actions")
    .doc("resolve")
    .get();
  const resolveData = resolveDoc.data();
  const userObject = await firestoreDb
    .collection("users")
    .doc(global.userId)
    .get();
  const userData = userObject.data();
  if (resolveData.acctName !== global.rewardDocument.bank.acctName) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "trigger document bank name mismatch",
      timestamp,
      uid: global.userId,
      status: 804,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    console.log("resolve name is:" + resolveData.acctName);
    console.log("reward name is:" + global.rewardDocument.bank.acctName);
    throw Error("trigger document bank name mismatch");
  }
  if (!subvendData.giftCardEquiv[global.rewardDocument.currency]?.amount) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Gift card currency missing",
      timestamp,
      uid: global.userId,
      status: 804,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    throw Error("Gift card currency missing");
  }
  global.triggerDocument = {
    claimant: {
      strapID: null,
      uid: null,
    },
    concat: null,
    country: null,
    createdAt: null,
    currency: null,
    defaultCurrency: null,
    domain: null,
    email: null,
    giftCard: {
      amount: null,
      id: null,
    },
    name: null,
    operatorID: null,
    phoneRef: null,
    processor: {
      name: null,
      ref: null,
    },
    raw: null,
    sessionID: null,
    strapType: null,
    subvend: null,
    success: {
      isSuccess: null,
      ref: null,
      successAt: null,
    },
    transmission: null,
    twitter: {
      handle: null,
      tid: null,
    },
    type: null,
    vend: null,
  };
  global.triggerDocument.alias = global.rewardDocument.alias;

  // use subvenddoc amount in 'to' map to replace rewarddoc amount
  global.triggerDocument.amount = Number(global.to.amt);
  global.triggerDocument.author = subvendData.author;
  global.triggerDocument.bank = {
    acctName: global.rewardDocument.bank.acctName,
    branchCode: global.rewardDocument.bank.branchCode,
    ref: global.rewardDocument.bank.ref,
  };
  global.triggerDocument.charity = global.rewardDocument.charity;
  global.triggerDocument.claimant = {
    strapID: subvendData.claimant.strap,
    uid: subvendData.claimant.uid,
  };

  let currency;
  switch (global.rewardDocument.transmission) {
    case "revend":
      currency = subvendData.currency;

      break;
    case "gfitCard":
      currency = subvendData.currency;

      break;

    default:
      currency = global.rewardDocument.currency;
      break;
  }

  global.triggerDocument.concat = global.booleanObjectId;
  global.triggerDocument.country = global.rewardDocument.country;
  global.triggerDocument.currency = currency;
  global.triggerDocument.defaultCurrency = subvendData.currency;
  global.triggerDocument.domain = subvendData.domain;
  if (!global.rewardDocument.email) {
    if (!userData.email) {
      global.triggerDocument.email = "";
    } else {
      global.triggerDocument.email = userData.email;
    }
  } else {
    global.triggerDocument.email = global.rewardDocument.email;
  }

  // for revend fetch currency from subvend doc

  // add amount from gift cardequiv to giftcard
  global.triggerDocument.giftCard = {
    amount: Number(
      subvendData.giftCardEquiv[global.rewardDocument.currency]?.amount
    ),
    id: global.rewardDocument.giftCard,
  };

  global.triggerDocument.name = global.rewardDocument.name;
  global.triggerDocument.operatorID = global.rewardDocument.operatorID;
  global.triggerDocument.phoneRef = global.rewardDocument.phoneRef;
  global.triggerDocument.processor = {
    name: "",
    ref: "",
  };
  global.triggerDocument.raw = Number(subvendData.to.raw);
  global.triggerDocument.sessionID = global.userId;
  global.triggerDocument.strapType = subvendData.claimant.strapType;
  global.triggerDocument.subvend = global.subvendId;
  global.triggerDocument.success = {
    isSuccess: null,
    ref: null,
    successAt: null,
  };
  global.triggerDocument.transmission = global.rewardDocument.transmission;
  global.triggerDocument.type = subvendData.vend.type;
  global.triggerDocument.vend = subvendData.vend.id;
  global.triggerDocument.twitter = {
    handle: global.rewardDocument.twitter.handle,
    tid: global.rewardDocument.twitter.tid,
  };
  console.log("merged memory trigger document is");
  console.log(global.triggerDocument);
};
const subvendExpired = async () => {
  const createTime = global.subvendDoc.createTime.toMillis();
  let expiryTime = new Date(Date.now());
  expiryTime.setHours(
    expiryTime.getHours() + Number(global.subvendData.expiry)
  );

  if (expiryTime.getTime() < createTime) {
    console.log("subvend expired");
    console.log("subvend expiry time time " + expiryTime);
    console.log("subvend expiry time in millis " + expiryTime.getTime());
    console.log("subvend expiry hours " + global.subvendData.expiry);
    console.log(
      "subvend create time   " + global.subvendDoc.createTime.toDate()
    );
    console.log("subvend create time in millis " + createTime);
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Subvend expired",
      timestamp,
      uid: global.userId,
      status: 810,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.subvendRef.update({
      state: "inactive",
    });
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return true;
  }
  console.log("Subvend active");
  return false;
};
const validateBankTransmission = async () => {
  const mainDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId)
    .collection("logs")
    .doc("main")
    .get();
  const mainDocData = mainDoc.data();

  if (!global.rewardDocument.transmissionCode == mainDocData.transmissionCode) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Transmission mismatch ",
      timestamp,
      uid: global.userId,
      status: 809,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return false;
  }
  return true;
};
const userIdExistsInSuccessCollection = async () => {
  const successRef = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("success")
    .get();
  if (!successRef.exists) {
    return false;
  }
  const successData = successRef.data();
  if (successData.userUID) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "User already claimed vend",
      timestamp,
      uid: global.userId,
      status: 808,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    const hashData = `${global.userId}${global.vendId}`;

    const booleanObjectId = crypto
      .createHash("sha256")
      .update(hashData)
      .digest("hex");
    global.booleanObjectId;
    await global.vendSessionRef.update({state: "closed"});
    const knocksRef = ref.child(
      `vends/${global.vendId}/knocks/attempts/${booleanObjectId}/subvend`
    );
    await knocksRef.update({status: "closed"});
    return true;
  }
  console.log("User eligible");
  return false;
};
const passedSubvendValidation = async () => {
  global.subvendRef = firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId);
  const subvendDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .collection("subVend")
    .doc(global.subvendId)
    .get();
  global.subvendDoc = subvendDoc;
  global.subvendData = subvendDoc.data();
  if (global.subvendData.claimant.uid == global.userId) {
    console.log("Claimant Id passed");
  } else {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Claimant Id not valid",
      timestamp,
      uid: global.userId,
      status: 817,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
  }
  if (!global.subvendData.passcode) {
    console.log("Passcode non existent");
    return true;
  }
  if (global.subvendData.passcode == global.rewardDocument.passcode) {
    console.log("Passcode check passed");
    return true;
  } else {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Passcode  not valid",
      timestamp,
      uid: global.userId,
      status: 804,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return false;
  }
};
const passedRtdValidation = async () => {
  const rtdRef = ref.child(`vends/${global.vendId}/public/state`);
  const rtdObject = await rtdRef.once("value");
  const rtdData = rtdObject.val();

  if (rtdData != "active") {
    console.log(`vend is ${rtdData} `);
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: `vend is ${rtdData} `,
      timestamp,
      uid: global.userId,
      status: 806,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return false;
  }
  console.log("vend is active");
  return true;
};
const checkVendSessionStatusIsWon = async () => {
  global.vendSessionRef = firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId);
  const vendSessionDoc = await firestoreDb
    .collection("vends")
    .doc(global.vendId)
    .collection("sessions")
    .doc(global.userId)
    .get();
  const vendSessionDocData = vendSessionDoc.data();
  let subvendReversed = false;
  if (vendSessionDocData.reversals) {
    vendSessionDocData.reversals.forEach((subvendId) => {
      if (subvendId == global.subvendId) {
        subvendReversed = true;
      }
    });
  }
  if (vendSessionDocData.state == "won" && subvendReversed == false) {
    return true;
  }
  return false;
};

const handleBankTransmission = async () => {
  const bankDetails = global.rewardDocument.bank.ref.split("_");
  const userRtdRef = ref.child(
    `users/${global.userId}/myBankAccts/${global.rewardDocument.bank.ref}`
  );

  const userBankRtdRef = ref.child(`users/${global.userId}/myBankAccts`);
  const userBankDoc = await userBankRtdRef.once("value");
  const userBankData = userBankDoc.val();
  const userBankCodRef = ref.child(
    `institutions/${global.rewardDocument.currency}/bank/shortNames/${bankDetails[1]}`
  );
  const userBankCodeDoc = await userBankCodRef.once("value");
  const userBankCodeData = userBankCodeDoc.val();
  await userRtdRef.set({
    acctNo: bankDetails[0],
    bankCode: bankDetails[1],
    bankName: userBankCodeData ? userBankCodeData : "",
    country: global.rewardDocument.country,
    currency: global.rewardDocument.currency,
    isPrimary: false,
    name: global.rewardDocument.bank.accountName
      ? global.rewardDocument.bank.accountName
      : global.rewardDocument.name,
  });

  if (global.rewardDocument.isPrimary) {
    console.log("isPrimary is true ");

    for (const bankRef in userBankData) {
      if (userBankData[bankRef]["isPrimary"]) {
        await userBankRtdRef.child(bankRef).update({
          isPrimary: false,
        });
      }
    }
    await userBankRtdRef.update({
      isPrimary: true,
    });
  }
};
const handleMMTransmission = async () => {
  const userRtdRef = ref.child(
    `users/${global.userId}/myMMAccts/${global.rewardDocument.phoneRef}`
  );

  const userMMRef = ref.child(`users/${global.userId}/myMMAccts`);
  const userMMDoc = await userMMRef.once("value");
  const userMMData = userMMDoc.val();
  const phoneDetails = global.rewardDocument.phoneRef.split("_");
  await userRtdRef.set({
    phoneNo: phoneDetails[0],
    carrier: phoneDetails[1],
    country: global.rewardDocument.country,
    currency: global.rewardDocument.currency,
    isPrimary: false,
    name: global.rewardDocument.name,
  });

  if (global.rewardDocument.isPrimary) {
    console.log("isPrimary is true ");

    for (const phoneRef in userMMData) {
      if (userMMData[phoneRef]["isPrimary"]) {
        await userMMRef.child(phoneRef).update({
          isPrimary: false,
        });
      }
    }
    await userRtdRef.update({isPrimary: true});
  }
};
const handleAirtimeTransmission = async () => {
  const userRtdRef = ref.child(
    `users/${global.userId}/myMMAccts/${global.rewardDocument.phoneRef}`
  );

  const userMMRef = ref.child(`users/${global.userId}/myMMAccts`);
  const userMMDoc = await userMMRef.once("value");
  const userMMData = userMMDoc.val();
  const phoneDetails = global.rewardDocument.phoneRef.split("_");
  await userRtdRef.set({
    phoneNo: phoneDetails[0],
    carrier: phoneDetails[1],
    country: global.rewardDocument.country,
    currency: global.rewardDocument.currency,
    isPrimary: false,
    alias: global.rewardDocument.alias ? global.rewardDocument.alias : "",
  });

  if (global.rewardDocument.isPrimary) {
    console.log("isPrimary is true ");

    for (const phoneRef in userMMData) {
      if (userMMData[phoneRef]["isPrimary"]) {
        await userMMRef.child(phoneRef).update({isPrimary: false});
      }
    }
    await userRtdRef.update({isPrimary: true});
  }
};
const passedPinValidation = async () => {
  const pinRef = ref.child(`users/${global.userId}/public_profile/PIN`);
  const pinObject = await pinRef.once("value");
  const pinData = pinObject.val();
  if (!pinData) {
    return true;
  }
  const pinDate = new Date(pinData.lastPIN);
  const now = new Date(Date.now());
  const difference = pinDate.getTime - now.getTime();
  const hoursDifference = Math.floor(difference / 1000 / 60 / 60);
  if (hoursDifference > 1) {
    const timestamp = Date.now();
    const fireStoreDate = admin.firestore.Timestamp.fromDate(
      new Date(timestamp)
    );
    const data = {
      message: "Pin error",
      timestamp,
      uid: global.userId,
      status: 815,
      critical: true,
      createdAt: fireStoreDate,
    };

    await logErrorInCollection(
      global.vendId,
      global.userId,
      global.subvendId,
      data,
      `${timestamp}_rewarder`
    );
    await global.booleanObjectRef.update({
      boolean: false,
      time: timestamp,
    });
    return false;
  } else {
    const pinHash = crypto
      .createHash("sha256")
      .update(global.rewardDocument.PIN)
      .digest("hex");
    console.log("pin hash  is " + pinHash);
    const userObject = await firestoreDb
      .collection("users")
      .doc(global.userId)
      .get();
    const userData = userObject.data();
    if (pinHash == userData.PIN) {
      console.log("Pin valid");
      return true;
    } else {
      console.log("Invalid pin");

      const timestamp = Date.now();
      const fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );
      const data = {
        message: "Invalid Pin",
        timestamp,
        uid: global.userId,
        status: 816,
        critical: true,
        createdAt: fireStoreDate,
      };

      await logErrorInCollection(
        global.vendId,
        global.userId,
        global.subvendId,
        data,
        `${timestamp}_rewarder`
      );
      await global.booleanObjectRef.update({
        boolean: false,
        time: timestamp,
      });
      return false;
    }
  }
};

// const runtimeOpts = {
//   timeoutSeconds: 300,
//   memory: "2GB",
// };

exports.rewarder = functions.firestore
  .document(
    "vends/{vendID}/sessions/{userID}/subVend/{subVendID}/states/accepted"
  )
  .onCreate(async (snap, context) => {
    try {
      console.log("Rewarder started");
      const rewardDocument = snap.data();
      global.rewardDocument = rewardDocument;
      switch (global.rewardDocument.country) {
        case "NG":
          global.rewardDocument.currency = "NGN";
          break;
        case "KE":
          global.rewardDocument.currency = "KES";
          break;
        case "UG":
          global.rewardDocument.currency = "UGX";
          break;
        case "GH":
          global.rewardDocument.currency = "GHS";
          break;
        case "ZA":
          global.rewardDocument.currency = "ZAR";
          break;
        case "US":
          global.rewardDocument.currency = "USD";
          break;
        case "CA":
          global.rewardDocument.currency = "CAD";
          break;
        case "GB":
          global.rewardDocument.currency = "GBP";
          break;
        case "IE":
          global.rewardDocument.currency = "EUR";
          break;

        default:
          break;
      }
      const hashData = `${global.userId}${global.vendId}`;
      const booleanObjectId = crypto
        .createHash("sha256")
        .update(hashData)
        .digest("hex");
      console.log("boolean id " + booleanObjectId);

      global.booleanObjectId = booleanObjectId;

      global.userId = context.params.userID;
      global.vendId = context.params.vendID;
      global.subvendId = context.params.subVendID;

      const booleanObjectRef = ref.child(
        `vends/${global.vendId}/knocks/attempts/${booleanObjectId}/subvend/backend`
      );
      const booleanRef = await booleanObjectRef.once("value");
      const booleanObject = booleanRef.val();
      global.booleanObjectRef = booleanObjectRef;
      await setTriggerObject();

      let timestamp = Date.now();
      let fireStoreDate = admin.firestore.Timestamp.fromDate(
        new Date(timestamp)
      );

      if (booleanObject.boolean) {
        console.log("Boolean true");
        console.log("Boolean value = " + booleanObject.boolean);

        const booleanDate = new Date(booleanObject.time);
        const now = new Date(Date.now());
        const difference = now.getTime() - booleanDate.getTime();
        const diffInSeconds = Math.floor(difference / 1000);

        if (diffInSeconds > 60) {
          console.log("time difference is greater than 60 seconds");
          console.log("difference is " + diffInSeconds);
          await global.booleanObjectRef.update({
            boolean: false,
            time: timestamp,
          });
        } else {
          console.log("time difference is less than 60 seconds");
          console.log("difference is " + diffInSeconds);
          console.log("boolean time " + booleanDate.getTime());
          console.log("now " + now.getTime)();

          const data = {
            message: "task currently running.try again later",
            timestamp,
            uid: global.userId,
            status: 800,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            global.vendId,
            global.userId,
            global.subvendId,
            data,
            `${timestamp}_rewarder`
          );
          return;
        }
      } else {
        console.log("Boolean False");
        console.log("Boolean value = " + booleanObject.boolean);
        await global.booleanObjectRef.update({boolean: true, time: timestamp});
      }
      const validationResult = await dataValidationPassed();

      if (validationResult != true) {
        return;
      }

      if (global.rewardDocument.transmission == "charity") {
        const charityValidationResult = await charityValidationPassed();
        if (!charityValidationResult) {
          const timestamp = Date.now();
          const fireStoreDate = admin.firestore.Timestamp.fromDate(
            new Date(timestamp)
          );
          console.log("charity validation failed");
          const data = {
            message: "Failed charity validation",
            timestamp,
            uid: global.userId,
            status: 802,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            global.vendId,
            global.userId,
            global.subvendId,
            data,
            `${timestamp}_rewarder`
          );
          await global.booleanObjectRef.update({
            boolean: true,
            time: timestamp,
          });
          return;
        } else {
          console.log("charity validation passed");
        }
      }
      if (global.rewardDocument.transmission == "giftCard") {
        const giftCardValidationResult = await giftCardValidationPassed();
        if (!giftCardValidationResult) {
          const timestamp = Date.now();
          const fireStoreDate = admin.firestore.Timestamp.fromDate(
            new Date(timestamp)
          );
          console.log("gift card validation failed");
          const data = {
            message: "Failed gift card validation",
            timestamp,
            uid: global.userId,
            status: 803,
            critical: true,
            createdAt: fireStoreDate,
          };

          await logErrorInCollection(
            global.vendId,
            global.userId,
            global.subvendId,
            data,
            `${timestamp}_rewarder`
          );
          await global.booleanObjectRef.update({
            boolean: true,
            time: timestamp,
          });
          return;
        } else {
          console.log("gift card validation passed");
        }
      }

      // Security section -Evaluates security section
      const pinValidationResult = await passedPinValidation();
      if (!pinValidationResult) {
        return;
      }
      const subvendValidationResult = await passedSubvendValidation();
      if (!subvendValidationResult) {
        return;
      }
      const rtdValidationResult = await passedRtdValidation();
      if (!rtdValidationResult) {
        return;
      }
      if (!(await checkVendSessionStatusIsWon)) {
        console.log("vend session is not won");
        const timestamp = Date.now();
        const fireStoreDate = admin.firestore.Timestamp.fromDate(
          new Date(timestamp)
        );
        const data = {
          message: "User no longer eligible ",
          timestamp,
          uid: global.userId,
          status: 807,
          critical: true,
          createdAt: fireStoreDate,
        };

        await logErrorInCollection(
          global.vendId,
          global.userId,
          global.subvendId,
          data,
          `${timestamp}_rewarder`
        );
        await global.booleanObjectRef.update({
          boolean: false,
          time: timestamp,
        });
        await global.subvendRef.update({
          state: "closed",
        });
        return;
      }
      if (await userIdExistsInSuccessCollection()) {
        return;
      }
      if (global.rewardDocument.transmission == "bank") {
        if (!(await validateBankTransmission())) {
          return;
        }
      }
      if (await subvendExpired()) {
        return;
      }

      // Schedule

      if (global.subvendData.acctVerify) {
        console.log("Account verify true");
        const timestamp = Date.now();
        const fireStoreDate = admin.firestore.Timestamp.fromDate(
          new Date(timestamp)
        );
        global.triggerDocument.createdAt = fireStoreDate;
        await firestoreDb
          .collection("vends")
          .doc(global.vendId)
          .collection("sessions")
          .doc(global.userId)
          .collection("subVend")
          .doc(global.subvendId)
          .doc("actions")
          .collection("schedule")
          .add({
            acctVerify: true,
            isUserDisputed: global.subvendData.isUserDisputed,
            data: global.triggerDocument,
          });

        const data = {
          message: "acctVerify is true",
          timestamp,
          uid: global.userId,
          status: 812,
          critical: true,
          createdAt: fireStoreDate,
        };

        await logErrorInCollection(
          global.vendId,
          global.userId,
          global.subvendId,
          data,
          `${timestamp}_rewarder`
        );

        const subvendStatusRef = ref.child(
          `vends/${global.vendId}/knocks/attempts/${booleanObjectId}/subvend`
        );
        await subvendStatusRef.update({status: "acctVerify"});
        await global.booleanObjectRef.update({
          boolean: false,
          time: timestamp,
        });
        return;
      }
      if (global.subvendData.isUserDisputed) {
        console.log("User disputed");
        await firestoreDb
          .collection("vends")
          .doc(global.vendId)
          .collection("sessions")
          .doc(global.userId)
          .collection("subVend")
          .doc(global.subvendId)
          .doc("actions")
          .collection("schedule")
          .add({
            acctVerify: true,
            isUserDisputed: global.subvendData.isUserDisputed,
            data: global.triggerDocument,
          });
        const timestamp = Date.now();
        const fireStoreDate = admin.firestore.Timestamp.fromDate(
          new Date(timestamp)
        );
        const data = {
          message: "isUserDisputed is true",
          timestamp,
          uid: global.userId,
          status: 613,
          critical: true,
          createdAt: fireStoreDate,
        };

        await logErrorInCollection(
          global.vendId,
          global.userId,
          global.subvendId,
          data,
          `${timestamp}_rewarder`
        );

        const subvendStatusRef = ref.child(
          `vends/${global.vendId}/knocks/attempts/${booleanObjectId}/subvend`
        );
        await subvendStatusRef.update({status: "userDisputed"});
        await global.booleanObjectRef.update({
          boolean: false,
          time: timestamp,
        });
        return;
      }
      if (
        !global.subvendData.isUserDisputed &&
        !global.subvendData.acctVerify
      ) {
        console.log("Scheduling for payment");
        await firestoreDb
          .collection("transactions")
          .doc("payouts")
          .collection("records")
          .add(global.triggerDocument);
        const timestamp = Date.now();
        const fireStoreDate = admin.firestore.Timestamp.fromDate(
          new Date(timestamp)
        );
        const data = {
          message: "Success schedule complete",
          timestamp,
          uid: global.userId,
          status: 200,
          critical: false,
          createdAt: fireStoreDate,
        };

        await logErrorInCollection(
          global.vendId,
          global.userId,
          global.subvendId,
          data,
          `${timestamp}_rewarder`
        );
      }
      // database updates
      if (global.rewardDocument.remember) {
        console.log(
          `handlind  ${global.rewardDocument.transmission} ,remember is true`
        );

        switch (global.rewardDocument.transmission) {
          case "bank":
            await handleBankTransmission();
            break;
          case "MM":
            await handleMMTransmission();
            break;
          case "airtime":
            await handleAirtimeTransmission();
            break;

          default:
            break;
        }
      }
      timestamp = Date.now();
      fireStoreDate = admin.firestore.Timestamp.fromDate(new Date(timestamp));
      await firestoreDb
        .collection("users")
        .doc(global.userId)
        .collection("myVends")
        .doc("attempted")
        .collection("vends")
        .doc(global.vendId)
        .update({
          state: admin.firestore.FieldValue.arrayUnion({
            createdAt: fireStoreDate,
            type: "rewarded",
          }),
        });
      console.log("function completed");
    } catch (error) {
      console.log("Unkown error");
      console.error(error);
    }
  });
