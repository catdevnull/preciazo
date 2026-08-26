import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { retry, type RetryError } from "../retry";

export const shouldRetryB2Error = (error: RetryError) => {
  if (error.name === "NotFound" || error.name === "NoSuchKey") return false;

  const status = (
    error as RetryError & { $metadata?: { httpStatusCode?: number } }
  ).$metadata?.httpStatusCode;
  return !status || status === 408 || status === 429 || status >= 500;
};

const retryB2Request = <T>(label: string, operation: () => Promise<T>) =>
  retry(operation, {
    retries: 4,
    minTimeout: 2_000,
    maxTimeout: 30_000,
    shouldRetry: shouldRetryB2Error,
    onFailedAttempt: (error) => {
      if (error.retriesLeft > 0) {
        const code = (error as RetryError & { code?: string }).code;
        console.warn(
          `⚠️ B2 ${label} failed (attempt ${error.attemptNumber}); retrying: ${code ?? error.message}`
        );
      }
    },
  });

function checkEnvVariable(variableName: string) {
  const value = process.env[variableName];
  if (value) {
    return value;
  } else {
    console.log(`❌ ${variableName} is not set`);
    process.exit(1);
  }
}
function getVariables() {
  const B2_BUCKET_NAME = checkEnvVariable("B2_BUCKET_NAME");
  const B2_BUCKET_KEY_ID = checkEnvVariable("B2_BUCKET_KEY_ID");
  const B2_BUCKET_KEY = checkEnvVariable("B2_BUCKET_KEY");

  return {
    B2_BUCKET_NAME,
    B2_BUCKET_KEY_ID,
    B2_BUCKET_KEY,
  };
}
let s3Client: S3Client | undefined;

function getS3Client() {
  if (s3Client) return s3Client;

  const { B2_BUCKET_NAME, B2_BUCKET_KEY_ID, B2_BUCKET_KEY } = getVariables();
  s3Client = new S3Client({
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    credentials: {
      accessKeyId: B2_BUCKET_KEY_ID,
      secretAccessKey: B2_BUCKET_KEY,
    },
  });
  return s3Client;
}
export async function listDirectory(directoryName: string) {
  return (await listFiles(directoryName)).map((item) => item.key);
}

export async function listFiles(directoryName: string) {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();
  let allContents: { key: string; size: number }[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      Prefix: directoryName ? `${directoryName}/` : "",
      Delimiter: "/",
      ContinuationToken: continuationToken,
    });

    const response = await retryB2Request("listFiles", () => s3.send(command));
    allContents = allContents.concat(
      response.Contents?.map((item) => ({
        key: item.Key ?? "",
        size: item.Size ?? 0,
      })) ?? []
    );
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return allContents;
}

export async function getFileContent(fileName: string) {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();

  const result = await retryB2Request("getFileContent", async () => {
    const fileContent = await s3.send(
      new GetObjectCommand({
        Bucket: B2_BUCKET_NAME,
        Key: fileName,
      })
    );
    return (await fileContent.Body?.transformToString()) ?? "";
  });

  return result;
}

export async function checkFileExists(fileName: string): Promise<boolean> {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();
  try {
    await retryB2Request("checkFileExists", () =>
      s3.send(
        new HeadObjectCommand({
          Bucket: B2_BUCKET_NAME,
          Key: fileName,
        })
      )
    );
    return true;
  } catch (error) {
    if ((error as any).name === "NotFound") {
      return false;
    }
    throw error;
  }
}
