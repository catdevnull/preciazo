import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

function checkEnvVariable(variableName: string) {
  const value = process.env[variableName];
  if (value) {
    console.log(`✅ ${variableName} is set`);
    return value;
  } else {
    console.log(`❌ ${variableName} is not set`);
    process.exit(1);
  }
}
export const B2_BUCKET_NAME = checkEnvVariable("B2_BUCKET_NAME");
const B2_BUCKET_KEY_ID = checkEnvVariable("B2_BUCKET_KEY_ID");
const B2_BUCKET_KEY = checkEnvVariable("B2_BUCKET_KEY");
export const s3 = new S3Client({
  endpoint: "https://s3.us-west-004.backblazeb2.com",
  region: "us-west-004",
  credentials: {
    accessKeyId: B2_BUCKET_KEY_ID,
    secretAccessKey: B2_BUCKET_KEY,
  },
});

export async function listDirectory(directoryName: string) {
  const command = new ListObjectsV2Command({
    Bucket: B2_BUCKET_NAME,
    Prefix: directoryName ? `${directoryName}/` : "",
    Delimiter: "/",
  });

  const response = await s3.send(command);
  return response.Contents?.map((item) => item.Key ?? "") ?? [];
}

export async function getFileContent(fileName: string) {
  const fileContent = await s3.send(
    new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: fileName,
    })
  );
  return (await fileContent.Body?.transformToString()) ?? "";
}

export async function checkFileExists(fileName: string): Promise<boolean> {
  try {
    await s3.send(
      new HeadObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: fileName,
      })
    );
    return true;
  } catch (error) {
    if ((error as any).name === "NotFound") {
      return false;
    }
    throw error;
  }
}
