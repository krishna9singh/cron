const express = require("express");
const router = express.Router();
const multer = require("multer");
const Post = require("../models/post");
const Interest = require("../models/Interest");

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const fs = require("fs");
const path = require("path");
const cron = require("node-cron");

const uuid = require("uuid").v4;
require("dotenv").config();

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const POST_BUCKET = process.env.POST_BUCKET;

const s3 = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const directoryPath = "./content/rvcjinsta";

function findCorrespondingFile({ fileName, extensions }) {
  for (const e of extensions) {
    const file = path.join(directoryPath, `${fileName}.${e}`);
    if (fs.existsSync(file)) {
      return file;
    } else {
      null;
    }
  }
}

function findCorrespondingTextFile(f) {
  const parsedPath = path.parse(f);
  const fileNameWithoutExtension = parsedPath.name;
  const textFileName = `${fileNameWithoutExtension}.txt`;
  const textFilePath = path.join(parsedPath.dir, textFileName);
  return textFilePath;
}

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

router.post("/upcom", async (req, res) => {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    const textFiles = files.filter((file) => /\.txt$/i.test(file));
    const fileContents = [];

    textFiles.forEach((file) => {
      const filePath = path.join(directoryPath, file);
      const content = fs.readFileSync(filePath, "utf8");
      const normalizedText = content.replace(/(\n|\+)/g, " ");
      const textWithoutHashtags = normalizedText.replace(/#[^\s#]+/g, "");

      const hashtags = content.match(/#[^\s#]+/g);
      fileContents.push({ fileName: file, textWithoutHashtags, hashtags });

      const filename = file.split(".")[0];

      const extensions = ["mp4", "jpg"];
      const present = findCorrespondingFile({
        fileName: filename,
        extensions: extensions,
      });
      console.log(typeof present);
    });
  });
});

async function readAndProcessFiles(directoryPath) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }
    let allfiles = [];

    //checking for all files
    files.forEach((file) => {
      const filePath = path.join(directoryPath, file);

      // Check if the item is req. file
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        const filename = file.split(".")[0];
        const extensions = ["mp4", "jpg"];
        const present = findCorrespondingFile({
          fileName: filename,
          extensions: extensions,
        });

        if (present) {
          const ext = getFileExtension(filePath);
          let textfile = findCorrespondingTextFile(present);
          allfiles.push({ file: present, textfile: textfile, extension: ext });
        }
      }
    });

    let i = 0;
    while (i < allfiles.length) {
      let fileEntry = allfiles[i];

      let filePath = fileEntry.file;
      let textFilePath = fileEntry.textfile;

      if (fs.existsSync(filePath) && fs.existsSync(textFilePath)) {
        if (filePath.endsWith(".json.xz")) {
          fs.unlinkSync(filePath);
          fs.unlinkSync(textFilePath);
        } else {
          const content = fs.readFileSync(textFilePath, "utf8");
          const normalizedText = content.replace(/(\n|\+)/g, " ");
          const textWithoutHashtags = normalizedText.replace(/#[^\s#]+/g, "");
          const hashtags = content.match(/#[^\s#]+/g);

          console.log(
            textWithoutHashtags,
            "content",
            hashtags,
            filePath,
            fileEntry.extension
          );

          uploadPostToS3({
            file: filePath,
            textWithoutHashtags,
            hashtags,
            textFilePath,
            extension: fileEntry.extension,
          });
        }
        break;
      } else {
        i++;
        console.error(
          "Either file or text file does not exist:",
          filePath,
          textFilePath
        );
      }
    }
  });
}

// Function to upload post to S3
async function uploadPostToS3({
  file,
  textFilePath,
  extension,
  textWithoutHashtags,
  hashtags,
}) {
  console.log("Uploading file:", file);

  try {
    let pos = [];

    // Uploading files to S3
    const uuidString = uuid();
    const objectName = `${Date.now()}_${uuidString}${extension}`;

    const result = await s3.send(
      new PutObjectCommand({
        Bucket: POST_BUCKET,
        Key: objectName,
        Body: fs.readFileSync(file),
      })
    );

    pos.push({ content: objectName, type: "video/mp4" });
    console.log(objectName);
    const post = new Post({
      title: textWithoutHashtags,
      desc: "sdfg",
      community: "65d31af686d0b529ceef9d5e",
      sender: "64a7bd59c9aab1a5960083e0",
      post: pos,
      tags: hashtags,
      topicId: "65dc4df42ea2d3ff8570abed",
    });
    const savedpost = await post.save();
    fs.unlinkSync(file);
    fs.unlinkSync(textFilePath);
    console.log("Post uploaded and saved");
  } catch (error) {
    console.error("Error uploading post:", error);
  }
}

// Define the cron schedule (every 15 minutes)
cron.schedule("*/10 * * * * *", () => {
  console.log("Running file reading and processing task...");

  // Example usage: Provide the directory path as an argument
  readAndProcessFiles("./content/rvcjinsta");
});

module.exports = router;
