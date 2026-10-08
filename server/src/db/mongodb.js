import { MongoClient } from 'mongodb';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

// MongoDB connection URI
const MONGO_URI =
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  'mongodb://localhost:27017/court_cms';

let clientInstance = null;
let dbInstance = null;
let indexesInitialized = false;

// Serial execution queue for transactions to emulate serializable isolation
let txLock = Promise.resolve();
function acquireTxLock() {
  let release;
  const nextLock = new Promise((resolve) => {
    release = resolve;
  });
  const waitLock = txLock;
  txLock = waitLock.then(() => nextLock);
  return waitLock.then(() => release);
}

export async function getDb() {
  if (dbInstance && clientInstance) return dbInstance;
  if (!clientInstance) {
    clientInstance = new MongoClient(MONGO_URI, {
      directConnection: true,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      maxPoolSize: 50,
      minPoolSize: 2,
    });
    await clientInstance.connect();
  }
  let dbName = 'court_cms';
  try {
    const url = new URL(MONGO_URI.replace('mongodb://', 'http://'));
    if (url.pathname && url.pathname.length > 1) {
      dbName = url.pathname.slice(1).split('?')[0];
    }
  } catch {
    // fallback
  }
  dbInstance = clientInstance.db(dbName);

  if (!indexesInitialized) {
    indexesInitialized = true;
    try {
      await initIndexes(dbInstance);
    } catch (err) {
      console.warn('Index initialization note:', err.message);
    }
  }
  return dbInstance;
}

async function initIndexes(db) {
  await Promise.allSettled([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('advocates').createIndex({ barNumber: 1 }, { unique: true }),
    db.collection('advocates').createIndex(
      { userId: 1 },
      { unique: true, partialFilterExpression: { userId: { $type: 'string' } } }
    ),
    db.collection('courtrooms').createIndex({ name: 1 }, { unique: true }),
    db.collection('cases').createIndex({ caseNumber: 1 }, { unique: true }),
    db.collection('cases').createIndex({ status: 1 }),
    db.collection('cases').createIndex({ filingDate: 1 }),
    db.collection('cases').createIndex({ caseType: 1 }),
    db.collection('case_advocates').createIndex({ caseId: 1, advocateId: 1 }, { unique: true }),
    db.collection('hearings').createIndex({ scheduledAt: 1 }),
    db.collection('hearings').createIndex({ courtroomId: 1, scheduledAt: 1 }),
    db.collection('hearings').createIndex({ judgeId: 1, scheduledAt: 1 }),
    db.collection('hearing_events').createIndex({ hearingId: 1, createdAt: 1 }),
    db.collection('judgments').createIndex({ caseId: 1 }, { unique: true }),
    db.collection('case_status_history').createIndex({ caseId: 1 }),
    db.collection('case_sequences').createIndex({ prefix: 1, year: 1 }, { unique: true }),
    db.collection('system_settings').createIndex({ key: 1 }, { unique: true }),
  ]);
}

const COLLECTION_MAP = {
  user: 'users',
  advocate: 'advocates',
  courtroom: 'courtrooms',
  case: 'cases',
  caseAdvocate: 'case_advocates',
  hearing: 'hearings',
  hearingEvent: 'hearing_events',
  judgment: 'judgments',
  caseStatusHistory: 'case_status_history',
  caseSequence: 'case_sequences',
  systemSetting: 'system_settings',
};

function normalizeDoc(doc) {
  if (!doc) return null;
  const copy = { ...doc };
  if (!copy.id && copy._id) {
    copy.id = String(copy._id);
  }
  delete copy._id;
  return copy;
}

function matchesCondition(val, condition) {
  if (condition === null) return val === null;
  if (condition === undefined) return true;

  if (typeof condition === 'object' && !(condition instanceof Date) && !Array.isArray(condition)) {
    for (const [op, opVal] of Object.entries(condition)) {
      if (op === 'equals') {
        const isInsensitive = condition.mode === 'insensitive';
        if (isInsensitive && typeof val === 'string' && typeof opVal === 'string') {
          if (val.toLowerCase() !== opVal.toLowerCase()) return false;
        } else if (val !== opVal) {
          return false;
        }
      } else if (op === 'not') {
        if (opVal === null) {
          if (val === null || val === undefined) return false;
        } else if (matchesCondition(val, opVal)) {
          return false;
        }
      } else if (op === 'in') {
        if (!Array.isArray(opVal)) return false;
        if (!opVal.includes(val)) return false;
      } else if (op === 'notIn') {
        if (!Array.isArray(opVal)) return true;
        if (opVal.includes(val)) return false;
      } else if (op === 'lt') {
        const v = val instanceof Date ? val.getTime() : val;
        const cv = opVal instanceof Date ? opVal.getTime() : opVal;
        if (!(v < cv)) return false;
      } else if (op === 'lte') {
        const v = val instanceof Date ? val.getTime() : val;
        const cv = opVal instanceof Date ? opVal.getTime() : opVal;
        if (!(v <= cv)) return false;
      } else if (op === 'gt') {
        const v = val instanceof Date ? val.getTime() : val;
        const cv = opVal instanceof Date ? opVal.getTime() : opVal;
        if (!(v > cv)) return false;
      } else if (op === 'gte') {
        const v = val instanceof Date ? val.getTime() : val;
        const cv = opVal instanceof Date ? opVal.getTime() : opVal;
        if (!(v >= cv)) return false;
      } else if (op === 'contains') {
        if (val === null || val === undefined) return false;
        const isInsensitive = condition.mode === 'insensitive';
        const strVal = String(val);
        const search = String(opVal);
        if (isInsensitive) {
          if (!strVal.toLowerCase().includes(search.toLowerCase())) return false;
        } else {
          if (!strVal.includes(search)) return false;
        }
      } else if (op === 'startsWith') {
        if (val === null || val === undefined) return false;
        const isInsensitive = condition.mode === 'insensitive';
        const strVal = String(val);
        const search = String(opVal);
        if (isInsensitive) {
          if (!strVal.toLowerCase().startsWith(search.toLowerCase())) return false;
        } else {
          if (!strVal.startsWith(search)) return false;
        }
      } else if (op === 'endsWith') {
        if (val === null || val === undefined) return false;
        const isInsensitive = condition.mode === 'insensitive';
        const strVal = String(val);
        const search = String(opVal);
        if (isInsensitive) {
          if (!strVal.toLowerCase().endsWith(search.toLowerCase())) return false;
        } else {
          if (!strVal.endsWith(search)) return false;
        }
      }
    }
    return true;
  }

  return val === condition;
}

function getDocField(doc, key) {
  if (!doc) return undefined;
  if (doc[key] !== undefined) return doc[key];
  if (key === 'advocates') return doc._temp_advocates;
  if (key === 'hearings') return doc._temp_hearings;
  if (key === 'judge') return doc._temp_judge;
  if (key === 'judgment') return doc._temp_judgment;
  if (key === 'case') return doc._temp_case;
  if (key === 'courtroom') return doc._temp_courtroom;
  if (key === 'advocate') return doc._temp_advocate;
  if (key === 'user') return doc._temp_user;
  if (key === 'caseAssignments') return doc._temp_caseAssignments;
  return undefined;
}

function docMatchesWhere(doc, where) {
  if (!where || Object.keys(where).length === 0) return true;
  if (!doc) return false;

  for (const [key, val] of Object.entries(where)) {
    if (key === 'AND') {
      const andList = Array.isArray(val) ? val : [val];
      for (const clause of andList) {
        if (!docMatchesWhere(doc, clause)) return false;
      }
    } else if (key === 'OR') {
      const orList = Array.isArray(val) ? val : [val];
      const anyMatch = orList.some((clause) => docMatchesWhere(doc, clause));
      if (!anyMatch) return false;
    } else if (key === 'NOT') {
      const notList = Array.isArray(val) ? val : [val];
      for (const clause of notList) {
        if (docMatchesWhere(doc, clause)) return false;
      }
    } else if (key === 'prefix_year') {
      if (doc.prefix !== val.prefix || doc.year !== val.year) return false;
    } else if (key === 'caseId_advocateId') {
      if (doc.caseId !== val.caseId || doc.advocateId !== val.advocateId) return false;
    } else {
      const fieldVal = getDocField(doc, key);

      if (val && typeof val === 'object' && !(val instanceof Date)) {
        if ('some' in val || 'none' in val || 'every' in val) {
          const arr = Array.isArray(fieldVal) ? fieldVal : [];
          if ('some' in val && !arr.some((item) => docMatchesWhere(item, val.some))) return false;
          if ('none' in val && arr.some((item) => docMatchesWhere(item, val.none))) return false;
          if ('every' in val && !arr.every((item) => docMatchesWhere(item, val.every))) return false;
        } else if (
          !('equals' in val || 'not' in val || 'in' in val || 'notIn' in val || 'lt' in val || 'lte' in val || 'gt' in val || 'gte' in val || 'contains' in val || 'startsWith' in val || 'endsWith' in val || 'mode' in val)
        ) {
          if (!fieldVal) return false;
          if (!docMatchesWhere(fieldVal, val)) return false;
        } else {
          if (!matchesCondition(fieldVal, val)) return false;
        }
      } else {
        if (!matchesCondition(fieldVal, val)) return false;
      }
    }
  }

  return true;
}

function sortDocs(docs, orderBy) {
  if (!orderBy) return docs;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];

  return docs.sort((a, b) => {
    for (const order of orders) {
      for (const [field, dir] of Object.entries(order)) {
        let valA = a[field];
        let valB = b[field];

        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();

        if (valA === valB) continue;
        if (valA === undefined || valA === null) return dir === 'asc' ? -1 : 1;
        if (valB === undefined || valB === null) return dir === 'asc' ? 1 : -1;

        if (valA < valB) return dir === 'asc' ? -1 : 1;
        if (valA > valB) return dir === 'asc' ? 1 : -1;
      }
    }
    return 0;
  });
}

function applySelect(doc, select) {
  if (!select) return doc;
  const result = {};
  for (const [k, v] of Object.entries(select)) {
    if (v === true) {
      result[k] = doc[k];
    } else if (typeof v === 'object' && v !== null && doc[k] !== undefined) {
      if (Array.isArray(doc[k])) {
        result[k] = doc[k].map((item) => (v.select ? applySelect(item, v.select) : item));
      } else if (doc[k] !== null && typeof doc[k] === 'object') {
        result[k] = v.select ? applySelect(doc[k], v.select) : doc[k];
      } else {
        result[k] = doc[k];
      }
    }
  }
  return result;
}

function handleMongoError(err) {
  if (err.code === 11000 || (err.message && err.message.includes('E11000 duplicate key error'))) {
    const error = new Error('Unique constraint failed on the constraint: ' + (err.keyPattern ? Object.keys(err.keyPattern).join('_') : 'unique_constraint'));
    error.code = 'P2002';
    error.meta = { target: err.keyPattern ? Object.keys(err.keyPattern) : [] };
    throw error;
  }
  throw err;
}

function createModelDelegate(modelName) {
  const collectionName = COLLECTION_MAP[modelName];

  return {
    async findUnique(args = {}) {
      return this.findFirst(args);
    },

    async findFirst(args = {}) {
      const results = await this.findMany({ ...args, take: 1 });
      return results.length > 0 ? results[0] : null;
    },

    async findMany(args = {}) {
      const db = await getDb();
      const col = db.collection(collectionName);

      const where = { ...(args.where || {}) };
      if (where.prefix_year) {
        where.prefix = where.prefix_year.prefix;
        where.year = where.prefix_year.year;
        delete where.prefix_year;
      }
      if (where.caseId_advocateId) {
        where.caseId = where.caseId_advocateId.caseId;
        where.advocateId = where.caseId_advocateId.advocateId;
        delete where.caseId_advocateId;
      }

      const rawDocs = await col.find({}).toArray();
      let docs = rawDocs.map(normalizeDoc);

      await enrichForFiltering(modelName, docs);
      docs = docs.filter((doc) => docMatchesWhere(doc, where));
      cleanTemporaryRelations(modelName, docs);

      const relationsToPopulate = { ...(args.include || {}) };
      if (args.select) {
        for (const [key, val] of Object.entries(args.select)) {
          if (typeof val === 'object' && val !== null) {
            relationsToPopulate[key] = val;
          }
        }
      }

      if (Object.keys(relationsToPopulate).length > 0) {
        docs = await populateRelations(modelName, docs, relationsToPopulate);
      }

      if (args.orderBy) {
        docs = sortDocs(docs, args.orderBy);
      }

      const skip = args.skip || 0;
      const take = args.take !== undefined ? args.take : docs.length;
      docs = docs.slice(skip, skip + take);

      if (args.select) {
        docs = docs.map((d) => applySelect(d, args.select));
      }

      return docs;
    },

    async create(args = {}) {
      const db = await getDb();
      const col = db.collection(collectionName);
      const data = { ...args.data };

      const now = new Date();
      if (!data.id) {
        data.id = data.key || crypto.randomUUID();
      }
      if (!data.createdAt) {
        data.createdAt = now;
      }
      if (modelName !== 'hearingEvent' && modelName !== 'caseStatusHistory' && !data.updatedAt) {
        data.updatedAt = now;
      }
      data._id = data.id;

      try {
        await col.insertOne(data);
      } catch (err) {
        handleMongoError(err);
      }

      let created = normalizeDoc(data);

      const relationsToPopulate = { ...(args.include || {}) };
      if (args.select) {
        for (const [key, val] of Object.entries(args.select)) {
          if (typeof val === 'object' && val !== null) {
            relationsToPopulate[key] = val;
          }
        }
      }

      if (Object.keys(relationsToPopulate).length > 0) {
        const [populated] = await populateRelations(modelName, [created], relationsToPopulate);
        created = populated;
      }
      if (args.select) {
        created = applySelect(created, args.select);
      }
      return created;
    },

    async createMany(args = {}) {
      const db = await getDb();
      const col = db.collection(collectionName);
      const items = (args.data || []).map((item) => {
        const now = new Date();
        const copy = { ...item };
        if (!copy.id) {
          copy.id = copy.key || crypto.randomUUID();
        }
        if (!copy.createdAt) {
          copy.createdAt = now;
        }
        if (modelName !== 'hearingEvent' && modelName !== 'caseStatusHistory' && !copy.updatedAt) {
          copy.updatedAt = now;
        }
        copy._id = copy.id;
        return copy;
      });

      if (items.length > 0) {
        try {
          await col.insertMany(items);
        } catch (err) {
          handleMongoError(err);
        }
      }
      return { count: items.length };
    },

    async update(args = {}) {
      const db = await getDb();
      const col = db.collection(collectionName);

      const existing = await this.findFirst({ where: args.where });
      if (!existing) {
        throw new Error(`Record to update not found in ${modelName}`);
      }

      const updateData = { ...args.data };
      if (modelName !== 'hearingEvent' && modelName !== 'caseStatusHistory') {
        updateData.updatedAt = new Date();
      }

      const $set = {};
      const $inc = {};
      for (const [k, v] of Object.entries(updateData)) {
        if (v && typeof v === 'object' && 'increment' in v) {
          $inc[k] = v.increment;
        } else {
          $set[k] = v;
        }
      }

      const updateOp = {};
      if (Object.keys($set).length > 0) updateOp.$set = $set;
      if (Object.keys($inc).length > 0) updateOp.$inc = $inc;

      let updatedRaw;
      try {
        if (Object.keys($inc).length > 0) {
          const res = await col.findOneAndUpdate({ id: existing.id }, updateOp, {
            returnDocument: 'after',
          });
          updatedRaw = res;
        } else {
          await col.updateOne({ id: existing.id }, updateOp);
          updatedRaw = await col.findOne({ id: existing.id });
        }
      } catch (err) {
        handleMongoError(err);
      }

      let updated = normalizeDoc(updatedRaw);

      const relationsToPopulate = { ...(args.include || {}) };
      if (args.select) {
        for (const [key, val] of Object.entries(args.select)) {
          if (typeof val === 'object' && val !== null) {
            relationsToPopulate[key] = val;
          }
        }
      }

      if (Object.keys(relationsToPopulate).length > 0) {
        const [populated] = await populateRelations(modelName, [updated], relationsToPopulate);
        updated = populated;
      }
      if (args.select) {
        updated = applySelect(updated, args.select);
      }
      return updated;
    },

    async updateMany(args = {}) {
      const targets = await this.findMany({ where: args.where });
      const db = await getDb();
      const col = db.collection(collectionName);

      const updateData = { ...args.data };
      if (modelName !== 'hearingEvent' && modelName !== 'caseStatusHistory') {
        updateData.updatedAt = new Date();
      }

      let count = 0;
      for (const t of targets) {
        await col.updateOne({ id: t.id }, { $set: updateData });
        count++;
      }
      return { count };
    },

    async upsert(args = {}) {
      const existing = await this.findFirst({ where: args.where });
      if (existing) {
        return this.update({ where: { id: existing.id }, data: args.update, include: args.include, select: args.select });
      } else {
        return this.create({ data: args.create, include: args.include, select: args.select });
      }
    },

    async delete(args = {}) {
      const existing = await this.findFirst({ where: args.where });
      if (!existing) {
        throw new Error(`Record to delete not found in ${modelName}`);
      }
      const db = await getDb();
      const col = db.collection(collectionName);
      await col.deleteOne({ id: existing.id });
      return existing;
    },

    async deleteMany(args = {}) {
      const db = await getDb();
      const col = db.collection(collectionName);
      if (!args.where || Object.keys(args.where).length === 0) {
        const res = await col.deleteMany({});
        return { count: res.deletedCount };
      }
      const targets = await this.findMany({ where: args.where });
      if (targets.length === 0) return { count: 0 };
      const ids = targets.map((t) => t.id);
      const res = await col.deleteMany({ id: { $in: ids } });
      return { count: res.deletedCount };
    },

    async count(args = {}) {
      const items = await this.findMany({ where: args.where });
      return items.length;
    },

    async groupBy(args = {}) {
      const { by = [], where, _count } = args;
      const items = await this.findMany({ where });
      const map = new Map();
      for (const item of items) {
        const key = by.map((f) => String(item[f])).join(':::');
        if (!map.has(key)) {
          const groupObj = {};
          for (const f of by) {
            groupObj[f] = item[f];
          }
          groupObj._count = {};
          if (_count) {
            for (const countField of Object.keys(_count)) {
              groupObj._count[countField] = 0;
            }
          } else {
            groupObj._count = { _all: 0 };
          }
          map.set(key, { groupObj, count: 0 });
        }
        const entry = map.get(key);
        entry.count += 1;
        for (const countField of Object.keys(entry.groupObj._count)) {
          entry.groupObj._count[countField] += 1;
        }
      }
      return Array.from(map.values()).map((v) => v.groupObj);
    },
  };
}

async function enrichForFiltering(modelName, docs) {
  if (!docs || docs.length === 0) return;
  const db = await getDb();

  if (modelName === 'case') {
    const caseIds = docs.map((d) => d.id);
    const [rawAdvocates, rawHearings, rawJudges, rawJudgments, rawAllAdvocates, rawAllUsers] = await Promise.all([
      db.collection('case_advocates').find({ caseId: { $in: caseIds } }).toArray(),
      db.collection('hearings').find({ caseId: { $in: caseIds } }).toArray(),
      db.collection('users').find({ role: 'JUDGE' }).toArray(),
      db.collection('judgments').find({ caseId: { $in: caseIds } }).toArray(),
      db.collection('advocates').find({}).toArray(),
      db.collection('users').find({}).toArray(),
    ]);

    const userMap = new Map(rawAllUsers.map((u) => [u.id, normalizeDoc(u)]));
    const advProfilesMap = new Map(rawAllAdvocates.map((a) => {
      const item = normalizeDoc(a);
      if (item.userId) item.user = userMap.get(item.userId) || null;
      return [item.id, item];
    }));

    const advMap = new Map();
    for (const a of rawAdvocates) {
      const item = normalizeDoc(a);
      item.advocate = advProfilesMap.get(a.advocateId) || null;
      if (!advMap.has(a.caseId)) advMap.set(a.caseId, []);
      advMap.get(a.caseId).push(item);
    }

    const hearingMap = new Map();
    for (const h of rawHearings) {
      const item = normalizeDoc(h);
      if (!hearingMap.has(h.caseId)) hearingMap.set(h.caseId, []);
      hearingMap.get(h.caseId).push(item);
    }

    const judgeMap = new Map(rawJudges.map((j) => [j.id, normalizeDoc(j)]));
    const judgmentMap = new Map(rawJudgments.map((j) => [j.caseId, normalizeDoc(j)]));

    for (const doc of docs) {
      doc._temp_advocates = advMap.get(doc.id) || [];
      doc._temp_hearings = hearingMap.get(doc.id) || [];
      doc._temp_judge = doc.judgeId ? judgeMap.get(doc.judgeId) || null : null;
      doc._temp_judgment = judgmentMap.get(doc.id) || null;
    }
  } else if (modelName === 'hearing') {
    const caseIds = docs.map((d) => d.caseId).filter(Boolean);
    const [rawCases, rawCourtrooms, rawJudges, rawAdvocates, rawAllAdvocates] = await Promise.all([
      db.collection('cases').find({ id: { $in: caseIds } }).toArray(),
      db.collection('courtrooms').find({}).toArray(),
      db.collection('users').find({ role: 'JUDGE' }).toArray(),
      db.collection('case_advocates').find({ caseId: { $in: caseIds } }).toArray(),
      db.collection('advocates').find({}).toArray(),
    ]);

    const advProfilesMap = new Map(rawAllAdvocates.map((a) => [a.id, normalizeDoc(a)]));
    const advMap = new Map();
    for (const a of rawAdvocates) {
      const item = normalizeDoc(a);
      item.advocate = advProfilesMap.get(a.advocateId) || null;
      if (!advMap.has(a.caseId)) advMap.set(a.caseId, []);
      advMap.get(a.caseId).push(item);
    }

    const caseMap = new Map(rawCases.map((c) => {
      const item = normalizeDoc(c);
      item._temp_advocates = advMap.get(item.id) || [];
      return [item.id, item];
    }));

    const courtMap = new Map(rawCourtrooms.map((c) => [c.id, normalizeDoc(c)]));
    const judgeMap = new Map(rawJudges.map((j) => [j.id, normalizeDoc(j)]));

    for (const doc of docs) {
      doc._temp_case = caseMap.get(doc.caseId) || null;
      doc._temp_courtroom = courtMap.get(doc.courtroomId) || null;
      doc._temp_judge = doc.judgeId ? judgeMap.get(doc.judgeId) || null : null;
    }
  } else if (modelName === 'caseAdvocate') {
    const caseIds = docs.map((d) => d.caseId).filter(Boolean);
    const advIds = docs.map((d) => d.advocateId).filter(Boolean);
    const [rawCases, rawAdvocates, rawUsers] = await Promise.all([
      db.collection('cases').find({ id: { $in: caseIds } }).toArray(),
      db.collection('advocates').find({ id: { $in: advIds } }).toArray(),
      db.collection('users').find({}).toArray(),
    ]);

    const userMap = new Map(rawUsers.map((u) => [u.id, normalizeDoc(u)]));
    const caseMap = new Map(rawCases.map((c) => [c.id, normalizeDoc(c)]));
    const advMap = new Map(rawAdvocates.map((a) => {
      const item = normalizeDoc(a);
      if (item.userId) item.user = userMap.get(item.userId) || null;
      return [item.id, item];
    }));

    for (const doc of docs) {
      doc._temp_case = caseMap.get(doc.caseId) || null;
      doc._temp_advocate = advMap.get(doc.advocateId) || null;
    }
  } else if (modelName === 'advocate') {
    const userIds = docs.map((d) => d.userId).filter(Boolean);
    const advIds = docs.map((d) => d.id);
    const [rawUsers, rawAssignments, rawCases] = await Promise.all([
      db.collection('users').find({ id: { $in: userIds } }).toArray(),
      db.collection('case_advocates').find({ advocateId: { $in: advIds } }).toArray(),
      db.collection('cases').find({}).toArray(),
    ]);

    const caseMap = new Map(rawCases.map((c) => [c.id, normalizeDoc(c)]));
    const userMap = new Map(rawUsers.map((u) => [u.id, normalizeDoc(u)]));
    const asMap = new Map();
    for (const a of rawAssignments) {
      const item = normalizeDoc(a);
      item._temp_case = caseMap.get(item.caseId) || null;
      if (!asMap.has(a.advocateId)) asMap.set(a.advocateId, []);
      asMap.get(a.advocateId).push(item);
    }

    for (const doc of docs) {
      doc._temp_user = doc.userId ? userMap.get(doc.userId) || null : null;
      doc._temp_caseAssignments = asMap.get(doc.id) || [];
    }
  } else if (modelName === 'judgment') {
    const caseIds = docs.map((d) => d.caseId).filter(Boolean);
    const judgeIds = docs.map((d) => d.judgeId).filter(Boolean);
    const [rawCases, rawJudges, rawAdvocates] = await Promise.all([
      db.collection('cases').find({ id: { $in: caseIds } }).toArray(),
      db.collection('users').find({ id: { $in: judgeIds } }).toArray(),
      db.collection('case_advocates').find({ caseId: { $in: caseIds } }).toArray(),
    ]);

    const advMap = new Map();
    for (const a of rawAdvocates) {
      const item = normalizeDoc(a);
      if (!advMap.has(a.caseId)) advMap.set(a.caseId, []);
      advMap.get(a.caseId).push(item);
    }

    const caseMap = new Map(
      rawCases.map((c) => {
        const item = normalizeDoc(c);
        item._temp_advocates = advMap.get(item.id) || [];
        return [item.id, item];
      })
    );
    const judgeMap = new Map(rawJudges.map((j) => [j.id, normalizeDoc(j)]));

    for (const doc of docs) {
      doc._temp_case = caseMap.get(doc.caseId) || null;
      doc._temp_judge = doc.judgeId ? judgeMap.get(doc.judgeId) || null : null;
    }
  }
}

function cleanTemporaryRelations(modelName, docs) {
  for (const doc of docs) {
    delete doc._temp_advocates;
    delete doc._temp_hearings;
    delete doc._temp_judge;
    delete doc._temp_judgment;
    delete doc._temp_case;
    delete doc._temp_courtroom;
    delete doc._temp_advocate;
    delete doc._temp_user;
    delete doc._temp_caseAssignments;
  }
}

async function populateRelations(modelName, docs, include) {
  if (!docs || docs.length === 0 || !include) return docs;
  const db = await getDb();

  const result = docs.map((d) => ({ ...d }));

  if (modelName === 'user') {
    if (include.advocateProfile) {
      const userIds = result.map((u) => u.id);
      const advocates = await db.collection('advocates').find({ userId: { $in: userIds } }).toArray();
      const advMap = new Map(advocates.map((a) => [a.userId, normalizeDoc(a)]));
      for (const u of result) {
        u.advocateProfile = advMap.get(u.id) || null;
      }
    }
    if (include.assignedCases) {
      const userIds = result.map((u) => u.id);
      const cases = await db.collection('cases').find({ judgeId: { $in: userIds } }).toArray();
      const caseMap = new Map();
      for (const c of cases) {
        const item = normalizeDoc(c);
        if (!caseMap.has(c.judgeId)) caseMap.set(c.judgeId, []);
        caseMap.get(c.judgeId).push(item);
      }
      for (const u of result) {
        let list = caseMap.get(u.id) || [];
        if (include.assignedCases.where) {
          list = list.filter((c) => docMatchesWhere(c, include.assignedCases.where));
        }
        if (include.assignedCases.select) {
          list = list.map((c) => applySelect(c, include.assignedCases.select));
        }
        u.assignedCases = list;
      }
    }
  }

  if (modelName === 'advocate') {
    if (include.user) {
      const userIds = result.map((a) => a.userId).filter(Boolean);
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const a of result) {
        let u = a.userId ? userMap.get(a.userId) || null : null;
        if (u && include.user.select) {
          u = applySelect(u, include.user.select);
        }
        a.user = u;
      }
    }
    if (include.caseAssignments) {
      const advIds = result.map((a) => a.id);
      const assignments = await db.collection('case_advocates').find({ advocateId: { $in: advIds } }).toArray();
      const asMap = new Map();
      for (const rawAs of assignments) {
        const as = normalizeDoc(rawAs);
        if (!asMap.has(as.advocateId)) asMap.set(as.advocateId, []);
        asMap.get(as.advocateId).push(as);
      }

      const nestedInclude = { ...(include.caseAssignments.include || {}) };
      if (include.caseAssignments.select && include.caseAssignments.select.case) {
        nestedInclude.case = include.caseAssignments.select.case;
      }
      const needsCaseForWhere = Boolean(include.caseAssignments.where && include.caseAssignments.where.case);

      for (const a of result) {
        let list = asMap.get(a.id) || [];
        if (Object.keys(nestedInclude).length > 0 || needsCaseForWhere) {
          list = await populateRelations('caseAdvocate', list, { case: true, ...nestedInclude });
        }
        if (include.caseAssignments.where) {
          const whereCopy = { ...include.caseAssignments.where };
          const caseFilter = whereCopy.case;
          delete whereCopy.case;

          list = list.filter((as) => {
            if (caseFilter && as.case) {
              if (!docMatchesWhere(as.case, caseFilter)) return false;
            }
            return docMatchesWhere(as, whereCopy);
          });
        }
        if (include.caseAssignments.select) {
          list = list.map((item) => applySelect(item, include.caseAssignments.select));
        }
        a.caseAssignments = list;
      }
    }
  }

  if (modelName === 'case') {
    const caseIds = result.map((c) => c.id);

    if (include.judge) {
      const judgeIds = result.map((c) => c.judgeId).filter(Boolean);
      const judges = await db.collection('users').find({ id: { $in: judgeIds } }).toArray();
      const judgeMap = new Map(judges.map((j) => [j.id, normalizeDoc(j)]));
      for (const c of result) {
        let j = c.judgeId ? judgeMap.get(c.judgeId) || null : null;
        if (j && include.judge.select) {
          j = applySelect(j, include.judge.select);
        }
        c.judge = j;
      }
    }

    if (include.registeredBy) {
      const regIds = result.map((c) => c.registeredById).filter(Boolean);
      const regs = await db.collection('users').find({ id: { $in: regIds } }).toArray();
      const regMap = new Map(regs.map((r) => [r.id, normalizeDoc(r)]));
      for (const c of result) {
        let r = c.registeredById ? regMap.get(c.registeredById) || null : null;
        if (r && include.registeredBy.select) {
          r = applySelect(r, include.registeredBy.select);
        }
        c.registeredBy = r;
      }
    }

    if (include.advocates) {
      const rawAssignments = await db.collection('case_advocates').find({ caseId: { $in: caseIds } }).toArray();
      let assignments = rawAssignments.map(normalizeDoc);
      if (include.advocates.where) {
        assignments = assignments.filter((as) => docMatchesWhere(as, include.advocates.where));
      }
      if (include.advocates.orderBy) {
        assignments = sortDocs(assignments, include.advocates.orderBy);
      }
      const nestedAdv = { ...(include.advocates.include || {}) };
      if (include.advocates.select) {
        if (include.advocates.select.advocate) nestedAdv.advocate = include.advocates.select.advocate;
        if (include.advocates.select.assignedBy) nestedAdv.assignedBy = include.advocates.select.assignedBy;
        if (include.advocates.select.unassignedBy) nestedAdv.unassignedBy = include.advocates.select.unassignedBy;
      }
      if (Object.keys(nestedAdv).length > 0) {
        assignments = await populateRelations('caseAdvocate', assignments, nestedAdv);
      }
      const assignMap = new Map();
      for (const as of assignments) {
        let item = as;
        if (include.advocates.select) {
          item = applySelect(item, include.advocates.select);
        }
        if (!assignMap.has(as.caseId)) assignMap.set(as.caseId, []);
        assignMap.get(as.caseId).push(item);
      }
      for (const c of result) {
        c.advocates = assignMap.get(c.id) || [];
      }
    }

    if (include.hearings) {
      const rawHearings = await db.collection('hearings').find({ caseId: { $in: caseIds } }).toArray();
      let hearings = rawHearings.map(normalizeDoc);
      if (include.hearings.where) {
        hearings = hearings.filter((h) => docMatchesWhere(h, include.hearings.where));
      }
      if (include.hearings.orderBy) {
        hearings = sortDocs(hearings, include.hearings.orderBy);
      }
      if (include.hearings.take) {
        hearings = hearings.slice(0, include.hearings.take);
      }
      if (include.hearings.include) {
        hearings = await populateRelations('hearing', hearings, include.hearings.include);
      }
      const hearingMap = new Map();
      for (const h of hearings) {
        let item = h;
        if (include.hearings.select) {
          item = applySelect(item, include.hearings.select);
        }
        if (!hearingMap.has(h.caseId)) hearingMap.set(h.caseId, []);
        hearingMap.get(h.caseId).push(item);
      }
      for (const c of result) {
        c.hearings = hearingMap.get(c.id) || [];
      }
    }

    if (include.judgment) {
      const rawJudgments = await db.collection('judgments').find({ caseId: { $in: caseIds } }).toArray();
      let judgments = rawJudgments.map(normalizeDoc);
      if (include.judgment.include) {
        judgments = await populateRelations('judgment', judgments, include.judgment.include);
      }
      const jMap = new Map(judgments.map((j) => [j.caseId, j]));
      for (const c of result) {
        let j = jMap.get(c.id) || null;
        if (j && include.judgment.select) {
          j = applySelect(j, include.judgment.select);
        }
        c.judgment = j;
      }
    }

    if (include.statusHistory) {
      const rawHist = await db.collection('case_status_history').find({ caseId: { $in: caseIds } }).toArray();
      let hist = rawHist.map(normalizeDoc);
      if (include.statusHistory.orderBy) {
        hist = sortDocs(hist, include.statusHistory.orderBy);
      }
      if (include.statusHistory.include) {
        hist = await populateRelations('caseStatusHistory', hist, include.statusHistory.include);
      }
      const histMap = new Map();
      for (const h of hist) {
        let item = h;
        if (include.statusHistory.select) {
          item = applySelect(item, include.statusHistory.select);
        }
        if (!histMap.has(h.caseId)) histMap.set(h.caseId, []);
        histMap.get(h.caseId).push(item);
      }
      for (const c of result) {
        c.statusHistory = histMap.get(c.id) || [];
      }
    }
  }

  if (modelName === 'caseAdvocate') {
    const advIds = result.map((ca) => ca.advocateId).filter(Boolean);
    const caseIds = result.map((ca) => ca.caseId).filter(Boolean);
    const userIds = [
      ...result.map((ca) => ca.assignedById).filter(Boolean),
      ...result.map((ca) => ca.unassignedById).filter(Boolean),
    ];

    if (include.advocate) {
      const advs = await db.collection('advocates').find({ id: { $in: advIds } }).toArray();
      const advMap = new Map(advs.map((a) => [a.id, normalizeDoc(a)]));
      for (const ca of result) {
        let a = advMap.get(ca.advocateId) || null;
        if (a && include.advocate.select) {
          a = applySelect(a, include.advocate.select);
        }
        ca.advocate = a;
      }
    }

    if (include.case) {
      const cases = await db.collection('cases').find({ id: { $in: caseIds } }).toArray();
      const caseMap = new Map(cases.map((c) => [c.id, normalizeDoc(c)]));
      for (const ca of result) {
        let c = caseMap.get(ca.caseId) || null;
        if (c && include.case.select) {
          c = applySelect(c, include.case.select);
        }
        ca.case = c;
      }
    }

    if (include.assignedBy) {
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const ca of result) {
        let u = ca.assignedById ? userMap.get(ca.assignedById) || null : null;
        if (u && include.assignedBy.select) {
          u = applySelect(u, include.assignedBy.select);
        }
        ca.assignedBy = u;
      }
    }

    if (include.unassignedBy) {
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const ca of result) {
        let u = ca.unassignedById ? userMap.get(ca.unassignedById) || null : null;
        if (u && include.unassignedBy.select) {
          u = applySelect(u, include.unassignedBy.select);
        }
        ca.unassignedBy = u;
      }
    }
  }

  if (modelName === 'hearing') {
    const caseIds = result.map((h) => h.caseId).filter(Boolean);
    const courtIds = result.map((h) => h.courtroomId).filter(Boolean);
    const judgeIds = result.map((h) => h.judgeId).filter(Boolean);
    const hearingIds = result.map((h) => h.id);

    if (include.case) {
      const rawCases = await db.collection('cases').find({ id: { $in: caseIds } }).toArray();
      let cases = rawCases.map(normalizeDoc);

      const nestedCasePopulate = { ...(include.case.include || {}) };
      if (include.case.select) {
        for (const [key, val] of Object.entries(include.case.select)) {
          if (typeof val === 'object' && val !== null) {
            nestedCasePopulate[key] = val;
          }
        }
      }
      if (Object.keys(nestedCasePopulate).length > 0) {
        cases = await populateRelations('case', cases, nestedCasePopulate);
      }

      const caseMap = new Map(cases.map((c) => [c.id, c]));
      for (const h of result) {
        let c = caseMap.get(h.caseId) || null;
        if (c && include.case.select) {
          c = applySelect(c, include.case.select);
        }
        h.case = c;
      }
    }

    if (include.courtroom) {
      const rooms = await db.collection('courtrooms').find({ id: { $in: courtIds } }).toArray();
      const roomMap = new Map(rooms.map((r) => [r.id, normalizeDoc(r)]));
      for (const h of result) {
        let r = roomMap.get(h.courtroomId) || null;
        if (r && include.courtroom.select) {
          r = applySelect(r, include.courtroom.select);
        }
        h.courtroom = r;
      }
    }

    if (include.judge) {
      const judges = await db.collection('users').find({ id: { $in: judgeIds } }).toArray();
      const judgeMap = new Map(judges.map((j) => [j.id, normalizeDoc(j)]));
      for (const h of result) {
        let j = judgeMap.get(h.judgeId) || null;
        if (j && include.judge.select) {
          j = applySelect(j, include.judge.select);
        }
        h.judge = j;
      }
    }

    if (include.scheduledBy) {
      const sIds = result.map((h) => h.scheduledById).filter(Boolean);
      const schedulers = await db.collection('users').find({ id: { $in: sIds } }).toArray();
      const sMap = new Map(schedulers.map((u) => [u.id, normalizeDoc(u)]));
      for (const h of result) {
        let u = h.scheduledById ? sMap.get(h.scheduledById) || null : null;
        if (u && include.scheduledBy.select) {
          u = applySelect(u, include.scheduledBy.select);
        }
        h.scheduledBy = u;
      }
    }

    if (include.events) {
      const rawEvents = await db.collection('hearing_events').find({ hearingId: { $in: hearingIds } }).toArray();
      let events = rawEvents.map(normalizeDoc);
      if (include.events.orderBy) {
        events = sortDocs(events, include.events.orderBy);
      }
      if (include.events.include) {
        events = await populateRelations('hearingEvent', events, include.events.include);
      }
      const eventMap = new Map();
      for (const ev of events) {
        let item = ev;
        if (include.events.select) {
          item = applySelect(item, include.events.select);
        }
        if (!eventMap.has(ev.hearingId)) eventMap.set(ev.hearingId, []);
        eventMap.get(ev.hearingId).push(item);
      }
      for (const h of result) {
        h.events = eventMap.get(h.id) || [];
      }
    }
  }

  if (modelName === 'hearingEvent') {
    if (include.performedBy) {
      const userIds = result.map((e) => e.performedById).filter(Boolean);
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const e of result) {
        let u = userMap.get(e.performedById) || null;
        if (u && include.performedBy.select) {
          u = applySelect(u, include.performedBy.select);
        }
        e.performedBy = u;
      }
    }
    if (include.hearing) {
      const hIds = result.map((e) => e.hearingId).filter(Boolean);
      const hearings = await db.collection('hearings').find({ id: { $in: hIds } }).toArray();
      const hMap = new Map(hearings.map((h) => [h.id, normalizeDoc(h)]));
      for (const e of result) {
        let h = hMap.get(e.hearingId) || null;
        if (h && include.hearing.select) {
          h = applySelect(h, include.hearing.select);
        }
        e.hearing = h;
      }
    }
  }

  if (modelName === 'judgment') {
    if (include.case) {
      const caseIds = result.map((j) => j.caseId).filter(Boolean);
      const cases = await db.collection('cases').find({ id: { $in: caseIds } }).toArray();
      let normCases = cases.map(normalizeDoc);
      const nestedCasePopulate = { ...(include.case.include || {}) };
      if (include.case.select && include.case.select.judge) {
        nestedCasePopulate.judge = include.case.select.judge;
      }
      if (Object.keys(nestedCasePopulate).length > 0) {
        normCases = await populateRelations('case', normCases, nestedCasePopulate);
      }
      const caseMap = new Map(normCases.map((c) => [c.id, c]));
      for (const j of result) {
        let c = caseMap.get(j.caseId) || null;
        if (c && include.case.select) {
          c = applySelect(c, include.case.select);
        }
        j.case = c;
      }
    }
    if (include.judge) {
      const judgeIds = result.map((j) => j.judgeId).filter(Boolean);
      const judges = await db.collection('users').find({ id: { $in: judgeIds } }).toArray();
      const judgeMap = new Map(judges.map((j) => [j.id, normalizeDoc(j)]));
      for (const j of result) {
        let u = judgeMap.get(j.judgeId) || null;
        if (u && include.judge.select) {
          u = applySelect(u, include.judge.select);
        }
        j.judge = u;
      }
    }
    if (include.reservedBy) {
      const userIds = result.map((j) => j.reservedById).filter(Boolean);
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const j of result) {
        let u = userMap.get(j.reservedById) || null;
        if (u && include.reservedBy.select) {
          u = applySelect(u, include.reservedBy.select);
        }
        j.reservedBy = u;
      }
    }
    if (include.deliveredBy) {
      const userIds = result.map((j) => j.deliveredById).filter(Boolean);
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const j of result) {
        let u = j.deliveredById ? userMap.get(j.deliveredById) || null : null;
        if (u && include.deliveredBy.select) {
          u = applySelect(u, include.deliveredBy.select);
        }
        j.deliveredBy = u;
      }
    }
  }

  if (modelName === 'caseStatusHistory') {
    if (include.changedBy) {
      const userIds = result.map((h) => h.changedById).filter(Boolean);
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray();
      const userMap = new Map(users.map((u) => [u.id, normalizeDoc(u)]));
      for (const h of result) {
        let u = h.changedById ? userMap.get(h.changedById) || null : null;
        if (u && include.changedBy.select) {
          u = applySelect(u, include.changedBy.select);
        }
        h.changedBy = u;
      }
    }
  }

  return result;
}

export const mongoClient = {
  user: createModelDelegate('user'),
  advocate: createModelDelegate('advocate'),
  courtroom: createModelDelegate('courtroom'),
  case: createModelDelegate('case'),
  caseAdvocate: createModelDelegate('caseAdvocate'),
  hearing: createModelDelegate('hearing'),
  hearingEvent: createModelDelegate('hearingEvent'),
  judgment: createModelDelegate('judgment'),
  caseStatusHistory: createModelDelegate('caseStatusHistory'),
  caseSequence: createModelDelegate('caseSequence'),
  systemSetting: createModelDelegate('systemSetting'),

  async $transaction(fnOrArray) {
    if (typeof fnOrArray === 'function') {
      const release = await acquireTxLock();
      try {
        return await fnOrArray(mongoClient);
      } finally {
        release();
      }
    }
    if (Array.isArray(fnOrArray)) {
      return Promise.all(fnOrArray);
    }
    throw new Error('Unsupported $transaction argument');
  },

  async $queryRaw(strings, ...values) {
    const rawSql = typeof strings === 'string' ? strings : strings.reduce((acc, str, i) => acc + str + (values[i] !== undefined ? values[i] : ''), '');
    const db = await getDb();

    if (/SELECT\s+1/i.test(rawSql)) {
      await db.command({ ping: 1 });
      return [{ 1: 1 }];
    }

    if (/information_schema/i.test(rawSql)) {
      return [];
    }

    if (/SELECT id FROM cases WHERE id =/i.test(rawSql)) {
      const id = values[0];
      const doc = await mongoClient.case.findUnique({ where: { id } });
      return doc ? [{ id: doc.id }] : [];
    }
    if (/SELECT id FROM judgments WHERE case_id =/i.test(rawSql)) {
      const caseId = values[0];
      const doc = await mongoClient.judgment.findUnique({ where: { caseId } });
      return doc ? [{ id: doc.id }] : [];
    }
    if (/SELECT id FROM courtrooms WHERE id =/i.test(rawSql)) {
      const id = values[0];
      const doc = await mongoClient.courtroom.findUnique({ where: { id } });
      return doc ? [{ id: doc.id }] : [];
    }
    if (/SELECT id FROM users WHERE id =/i.test(rawSql)) {
      const id = values[0];
      const doc = await mongoClient.user.findUnique({ where: { id } });
      return doc ? [{ id: doc.id }] : [];
    }

    if (/FROM hearings h\s+JOIN cases c/i.test(rawSql) && /h\.courtroom_id =/i.test(rawSql)) {
      const courtroomId = values[0];
      const dayStartUTC = values[1];
      const dayEndUTC = values[2];
      const hearings = await mongoClient.hearing.findMany({
        where: {
          courtroomId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        include: { case: true },
      });
      return hearings.map((h) => ({
        id: h.id,
        scheduledAt: h.scheduledAt,
        durationMins: h.durationMins,
        caseNumber: h.case?.caseNumber || '',
      }));
    }

    if (/FROM hearings h\s+JOIN cases c/i.test(rawSql) && /h\.judge_id =/i.test(rawSql)) {
      const judgeId = values[0];
      const dayStartUTC = values[1];
      const dayEndUTC = values[2];
      const hearings = await mongoClient.hearing.findMany({
        where: {
          judgeId,
          status: 'SCHEDULED',
          scheduledAt: { gte: dayStartUTC, lte: dayEndUTC },
        },
        include: { case: true },
      });
      return hearings.map((h) => ({
        id: h.id,
        scheduledAt: h.scheduledAt,
        durationMins: h.durationMins,
        caseNumber: h.case?.caseNumber || '',
      }));
    }

    await db.command({ ping: 1 });
    return [];
  },

  async $runCommandRaw(command) {
    const db = await getDb();
    return db.command(command);
  },

  async $disconnect() {
    if (clientInstance) {
      await clientInstance.close();
      clientInstance = null;
      dbInstance = null;
    }
  },

  async $connect() {
    await getDb();
  },
};

export default mongoClient;
