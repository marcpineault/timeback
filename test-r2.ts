import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

console.log("Testing Cloudflare R2 Connection...\n");

// Check env vars
const missing: string[] = [];
if (!R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
if (!R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
if (!R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
if (!R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");

if (missing.length > 0) {
  console.error("Missing environment variables:", missing.join(", "));
  console.log("\nMake sure these are set in .env.local:");
  console.log("  R2_ACCOUNT_ID=your_account_id");
  console.log("  R2_ACCESS_KEY_ID=your_access_key");
  console.log("  R2_SECRET_ACCESS_KEY=your_secret_key");
  console.log("  R2_BUCKET_NAME=your_bucket_name");
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  },
});

async function testR2() {
  try {
    // Test 1: List objects
    console.log("1. Listing objects in bucket...");
    const listResult = await client.send(
      new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, MaxKeys: 5 })
    );
    console.log(`   ✓ Success! Found ${listResult.KeyCount || 0} objects\n`);

    // Test 2: Upload a test file
    console.log("2. Uploading test file...");
    const testKey = `test-${Date.now()}.txt`;
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: testKey,
        Body: "Hello from TimeBack! R2 is working.",
        ContentType: "text/plain",
      })
    );
    console.log(`   ✓ Uploaded: ${testKey}\n`);

    // Test 3: Delete the test file
    console.log("3. Cleaning up test file...");
    await client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: testKey,
      })
    );
    console.log(`   ✓ Deleted: ${testKey}\n`);

    console.log("═══════════════════════════════════════");
    console.log("  ✅ R2 CONNECTION SUCCESSFUL!");
    console.log("═══════════════════════════════════════");
    console.log(`\nBucket: ${R2_BUCKET_NAME}`);
    console.log(`Endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);

  } catch (error: unknown) {
    console.error("\n❌ R2 Connection Failed!\n");
    if (error instanceof Error) {
      console.error("Error:", error.message);
      if (error.name === "AccessDenied") {
        console.log("\nCheck that your API token has the correct permissions.");
      }
    }
    process.exit(1);
  }
}

testR2();
