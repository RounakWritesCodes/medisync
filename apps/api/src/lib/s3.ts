import { S3Client } from "@aws-sdk/client-s3";
import { config } from "../config.js";

export const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  forcePathStyle: true,
  region: config.s3Region,
  credentials: {
    accessKeyId: config.s3AccessKey,
    secretAccessKey: config.s3SecretKey,
  },
});
