// Fills partNoNormalized / brandKey on products saved before the duplicate rules, then reports whether the
// data is clean enough for a unique index.
//
//   npx ts-node src/scripts/backfillProductKeys.ts                 # backfill + report
//   npx ts-node src/scripts/backfillProductKeys.ts --unique-index  # also create the unique index if clean
//
// Safe to re-run. The unique index is partial: it only covers live products that have a part number.

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { connectToDatabase, disconnectFromDatabase } from '../db/connect';
import Product from '../models/products.model';
import { derivedKeys, normalizePartNo } from '../common/utils/productMatch';

const INDEX_NAME = 'uniq_live_brand_partNoNormalized';

const run = async () => {
    await connectToDatabase();

    const products = await Product.find({}).select('partNo brand aliases partNoNormalized brandKey').lean();
    const ops: any[] = [];
    for (const p of products as any[]) {
        const keys = derivedKeys(p.partNo, p.brand);
        const aliases = (p.aliases ?? []).map((a: any) => ({ ...a, valueNormalized: normalizePartNo(a.value) }));
        if (p.partNoNormalized !== keys.partNoNormalized || p.brandKey !== keys.brandKey) {
            ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { ...keys, ...(aliases.length ? { aliases } : {}) } } } });
        }
    }
    if (ops.length) await Product.bulkWrite(ops);
    console.log(`Backfilled ${ops.length} of ${products.length} products.`);

    const dupes = await Product.aggregate([
        { $match: { isDeleted: { $ne: true }, partNoNormalized: { $type: 'string', $ne: '' } } },
        { $group: { _id: { brand: '$brandKey', part: '$partNoNormalized' }, itemCodes: { $push: '$itemCode' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    if (dupes.length) {
        console.log(`${dupes.length} duplicate group(s) must be resolved before a unique index can be created:`);
        dupes.forEach((d) => console.log(`  ${d._id.brand} / ${d._id.part}: ${d.itemCodes.join(', ')}`));
    } else {
        console.log('No duplicates found.');
        if (process.argv.includes('--unique-index')) {
            await Product.collection.createIndex(
                { brandKey: 1, partNoNormalized: 1 },
                { unique: true, name: INDEX_NAME, partialFilterExpression: { isDeleted: false, partNoNormalized: { $gt: '' } } },
            );
            console.log(`Created unique index ${INDEX_NAME}.`);
        }
    }

    await disconnectFromDatabase();
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
