import type { Connection } from 'mongoose';
import { Types } from 'mongoose';

/**
 * Purchase request lines kept the catalogue link in partNo (an ObjectId). The link moves to productId
 * and partNo becomes the part number text, copied from the linked product.
 */
const isId = (v: any) => v?._bsontype === 'ObjectId';

export async function up(connection: Connection): Promise<void> {
  const purchases = connection.collection('purchases');
  const products = connection.collection('products');
  const cursor = purchases.find({ 'items.itemDetails.partNo': { $type: 'objectId' } });

  for await (const purchase of cursor) {
    const ids = new Set<string>();
    for (const item of purchase.items ?? []) {
      for (const detail of item.itemDetails ?? []) if (isId(detail.partNo)) ids.add(String(detail.partNo));
    }
    const found = await products.find({ _id: { $in: [...ids].map((id) => new Types.ObjectId(id)) } }).project({ partNo: 1 }).toArray();
    const textOf = new Map(found.map((p) => [String(p._id), p.partNo as string | undefined]));

    for (const item of purchase.items ?? []) {
      for (const detail of item.itemDetails ?? []) {
        if (!isId(detail.partNo)) continue;
        detail.productId = detail.partNo;
        const text = textOf.get(String(detail.partNo));
        if (text) detail.partNo = text; else delete detail.partNo;
      }
    }
    await purchases.updateOne({ _id: purchase._id }, { $set: { items: purchase.items } });
  }
}

export async function down(): Promise<void> {
}
