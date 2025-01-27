import {
  S3Client,
  HeadObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

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
function getS3Client() {
  const { B2_BUCKET_NAME, B2_BUCKET_KEY_ID, B2_BUCKET_KEY } = getVariables();
  return new S3Client({
    endpoint: "https://s3.us-west-004.backblazeb2.com",
    region: "us-west-004",
    credentials: {
      accessKeyId: B2_BUCKET_KEY_ID,
      secretAccessKey: B2_BUCKET_KEY,
    },
  });
}
export async function listDirectory(directoryName: string) {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();
  let allContents: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      Prefix: directoryName ? `${directoryName}/` : "",
      Delimiter: "/",
      ContinuationToken: continuationToken,
    });

    const response = await s3.send(command);
    allContents = allContents.concat(
      response.Contents?.map((item) => item.Key ?? "") ?? []
    );
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return allContents;
}

export async function getFileContent(fileName: string) {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();
  const fileContent = await s3.send(
    new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: fileName,
    })
  );
  return (await fileContent.Body?.transformToString()) ?? "";
}

export async function checkFileExists(fileName: string): Promise<boolean> {
  const { B2_BUCKET_NAME } = getVariables();
  const s3 = getS3Client();
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
