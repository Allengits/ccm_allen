import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let storeInstance = null;

function matchDoc(doc, query) {
  if (!query || Object.keys(query).length === 0) return true;
  for (const [key, cond] of Object.entries(query)) {
    if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ('$in' in cond) {
        if (!Array.isArray(cond.$in) || !cond.$in.includes(doc[key])) return false;
      } else if ('$type' in cond) {
        if (typeof doc[key] !== cond.$type) return false;
      }
    } else if (doc[key] !== cond) {
      return false;
    }
  }
  return true;
}

export function createInMemoryDatabase() {
  if (storeInstance) return storeInstance;

  const seedPath = path.join(__dirname, 'seedData.json');
  let rawData = {};
  try {
    if (fs.existsSync(seedPath)) {
      rawData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
    }
  } catch (err) {
    console.warn('[InMemoryDB] Could not parse seedData.json:', err.message);
  }

  const collections = {};

  for (const [colName, docs] of Object.entries(rawData)) {
    collections[colName] = docs.map((doc) => {
      const copy = { ...doc };
      if (copy._id && !copy.id) copy.id = String(copy._id);
      delete copy._id;
      for (const [k, v] of Object.entries(copy)) {
        if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) {
          copy[k] = new Date(v);
        }
      }
      return copy;
    });
  }

  function getCol(name) {
    if (!collections[name]) {
      collections[name] = [];
    }
    const list = collections[name];

    return {
      find(query = {}) {
        return {
          toArray: async () => {
            return list.filter((doc) => matchDoc(doc, query)).map((d) => ({ ...d }));
          },
        };
      },

      findOne: async (query = {}) => {
        const found = list.find((doc) => matchDoc(doc, query));
        return found ? { ...found } : null;
      },

      insertOne: async (doc) => {
        const copy = { ...doc };
        if (!copy.id && copy._id) copy.id = String(copy._id);
        if (!copy.id) copy.id = copy.key || crypto.randomUUID();
        copy._id = copy.id;
        list.push(copy);
        return { insertedId: copy.id };
      },

      insertMany: async (items) => {
        for (const item of items) {
          const copy = { ...item };
          if (!copy.id && copy._id) copy.id = String(copy._id);
          if (!copy.id) copy.id = copy.key || crypto.randomUUID();
          copy._id = copy.id;
          list.push(copy);
        }
        return { insertedCount: items.length };
      },

      updateOne: async (filter, updateOp) => {
        const idx = list.findIndex((doc) => matchDoc(doc, filter));
        if (idx !== -1) {
          const target = list[idx];
          if (updateOp.$set) {
            Object.assign(target, updateOp.$set);
          }
          if (updateOp.$inc) {
            for (const [k, v] of Object.entries(updateOp.$inc)) {
              target[k] = (target[k] || 0) + v;
            }
          }
          return { modifiedCount: 1 };
        }
        return { modifiedCount: 0 };
      },

      findOneAndUpdate: async (filter, updateOp) => {
        const idx = list.findIndex((doc) => matchDoc(doc, filter));
        if (idx !== -1) {
          const target = list[idx];
          if (updateOp.$set) {
            Object.assign(target, updateOp.$set);
          }
          if (updateOp.$inc) {
            for (const [k, v] of Object.entries(updateOp.$inc)) {
              target[k] = (target[k] || 0) + v;
            }
          }
          return { ...target };
        }
        return null;
      },

      deleteOne: async (filter) => {
        const idx = list.findIndex((doc) => matchDoc(doc, filter));
        if (idx !== -1) {
          list.splice(idx, 1);
          return { deletedCount: 1 };
        }
        return { deletedCount: 0 };
      },

      deleteMany: async (filter = {}) => {
        if (!filter || Object.keys(filter).length === 0) {
          const count = list.length;
          list.length = 0;
          return { deletedCount: count };
        }
        let count = 0;
        for (let i = list.length - 1; i >= 0; i--) {
          if (matchDoc(list[i], filter)) {
            list.splice(i, 1);
            count++;
          }
        }
        return { deletedCount: count };
      },

      createIndex: async () => {},
      countDocuments: async (query = {}) => {
        return list.filter((doc) => matchDoc(doc, query)).length;
      },
    };
  }

  storeInstance = {
    collection(name) {
      return getCol(name);
    },
    async command() {
      return { ok: 1 };
    },
    async listCollections() {
      return {
        toArray: async () => Object.keys(collections).map((name) => ({ name })),
      };
    },
  };

  return storeInstance;
}
