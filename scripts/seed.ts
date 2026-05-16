import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { products } from "../src/data/products";
import { ddb } from "../src/db/dynamoClient";
import { AWS_PRODUCTS_TABLE, AWS_STOCKS_TABLE } from "../src/const/consts";

async function seed() {

  const productItems = products.map(({ count: _count, ...rest }) => ({
    PutRequest: { Item: rest },
  }));

  const stockItems = products.map((p) => ({
    PutRequest: { Item: { product_id: p.id, count: p.count } },
  }));

  await ddb.send(
    new BatchWriteCommand({ RequestItems: { [AWS_PRODUCTS_TABLE]: productItems } })
  );
  console.log(`Wrote ${productItems.length} items to ${AWS_PRODUCTS_TABLE}`);

  await ddb.send(
    new BatchWriteCommand({ RequestItems: { [AWS_STOCKS_TABLE]: stockItems } })
  );
  console.log(`Wrote ${stockItems.length} items to ${AWS_STOCKS_TABLE}`);
}

seed().catch((err) => {
  console.error("Seed failed", err);
  process.exit(1);
});
