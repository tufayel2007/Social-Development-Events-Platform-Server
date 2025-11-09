// server.js
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = 3000;

// CORS - সব localhost + Netlify allow
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "https://sdep-community.netlify.app",
        "https://sdep-community.firebaseapp.com",
      ];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // ডেভেলপমেন্টে সব allow
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// MongoDB Connection
const uri =
  process.env.MONGODB_URI ||
  "mongodb+srv://SDEP:kyxCQB4WM3zKkYOb@cluster0.cif7e2s.mongodb.net/?appName=Cluster0";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
async function connectDB() {
  if (db) return db;
  try {
    await client.connect();
    db = client.db("SDEP");
    console.log("MongoDB Connected!");
    return db;
  } catch (err) {
    console.error("MongoDB Connection Failed:", err);
    process.exit(1);
  }
}

// Home Route
app.get("/", (req, res) => {
  res.send("<h1>SDEP API চালু আছে! Server চলছে!</h1>");
});

// Upcoming Events
app.get("/api/events/upcoming", async (req, res) => {
  const { type, search } = req.query;
  try {
    const database = await connectDB();
    const collection = database.collection("Create_Event");

    let query = {
      $expr: { $gt: [{ $toDate: "$eventDate" }, new Date()] },
    };

    if (type && type !== "all") query.eventType = type;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const events = await collection
      .find(query)
      .sort({ eventDate: 1 })
      .toArray();
    res.status(200).json(events);
  } catch (error) {
    console.error("Upcoming Events Error:", error);
    res.status(500).json({ error: "Failed to load events" });
  }
});

// 🌟🌟🌟 ফিক্স: My Events রুটটিকে Single Event রুটের উপরে আনা হয়েছে 🌟🌟🌟
// My Events (নির্দিষ্ট রুট)
app.get("/api/events/my", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const database = await connectDB();
    const collection = database.collection("Create_Event");

    const events = await collection
      .find({ creatorEmail: email })
      .sort({ eventDate: -1 })
      .toArray();

    res.json(events);
  } catch (err) {
    console.error("My Events Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ----------------------------------------------------
// 💡 নতুন রুট: Joined Events (ইউজার যে ইভেন্টগুলোতে জয়েন করেছে)
// ----------------------------------------------------
app.get("/api/events/joined", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Email query parameter required" });
  }

  try {
    const database = await connectDB();
    const collection = database.collection("Create_Event");

    // কোয়েরি: সেই ইভেন্টগুলো খুঁজছি, যাদের joinedUsers array-এর মধ্যে এই 'email' টি আছে
    // সর্টিং: রিকোয়্যারমেন্ট অনুযায়ী eventDate অনুসারে সাজানো (1 মানে ascend)
    const events = await collection
      .find({ joinedUsers: email })
      .sort({ eventDate: 1 })
      .toArray();

    res.json(events);
  } catch (err) {
    console.error("Joined Events Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
// ----------------------------------------------------

// Single Event (প্যারামিটারাইজড রুট)
app.get("/api/events/:id", async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: "Invalid event ID" });
    }

    const database = await connectDB();
    const collection = database.collection("Create_Event");
    const event = await collection.findOne({
      _id: new ObjectId(req.params.id),
    });

    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) {
    console.error("Single Event Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Join Event
app.post("/api/events/:id/join", async (req, res) => {
  try {
    const { userEmail } = req.body;
    if (!userEmail)
      return res.status(400).json({ error: "User email required" });
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ error: "Invalid event ID" });

    const database = await connectDB();
    const collection = database.collection("Create_Event");

    const result = await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $addToSet: { joinedUsers: userEmail } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ message: "Joined successfully!" });
  } catch (err) {
    console.error("Join Error:", err);
    res.status(500).json({ error: "Join failed" });
  }
});

// Create Event
app.post("/api/events", async (req, res) => {
  try {
    const database = await connectDB();
    const collection = database.collection("Create_Event");

    const {
      title,
      description,
      eventType,
      thumbnail1,
      location,
      eventDate: isoDate,
      creatorEmail = "guest@example.com",
    } = req.body;

    if (
      !title ||
      !description ||
      !eventType ||
      !thumbnail1 ||
      !location ||
      !isoDate
    ) {
      return res.status(400).json({ error: "সব ফিল্ড পূরণ করুন" });
    }

    const eventDate = new Date(isoDate);
    if (isNaN(eventDate.getTime()) || eventDate <= new Date()) {
      return res.status(400).json({ error: "ভবিষ্যতের তারিখ দিন" });
    }

    const eventData = {
      title: title.trim(),
      description: description.trim(),
      eventType,
      thumbnail1: thumbnail1.trim(),
      location: location.trim(),
      eventDate,
      creatorEmail,
      joinedUsers: [],
      createdAt: new Date(),
    };

    const result = await collection.insertOne(eventData);
    res
      .status(201)
      .json({ message: "ইভেন্ট তৈরি হয়েছে!", id: result.insertedId });
  } catch (error) {
    console.error("Create Error:", error);
    res.status(500).json({ error: "সার্ভারে সমস্যা" });
  }
});
// LOGIN_USER

// 💡 নতুন রুট: USER REGISTRATION / SOCIAL LOGIN (MongoDB Save/Update)
// এই রুটটি Firebase Login/Register এর পর Client থেকে কল করা হবে।
// ----------------------------------------------------
app.post("/api/LOGIN_USER/save-user", async (req, res) => {
  const { uid, email, fullName, photoURL, role = "user" } = req.body;
  console.log("Incoming user data for MongoDB:", { uid, email });
  if (!uid || !email) {
    return res.status(400).json({ error: "UID and Email are required" });
  }

  try {
    const database = await connectDB(); // 💡 নতুন কালেকশন: "users"
    const usersCollection = database.collection("LOGIN_USER"); // Upsert অপারেশন: যদি UID ম্যাচ করে তবে আপডেট করো, না হলে নতুন করে তৈরি করো

    const result = await usersCollection.updateOne(
      { uid: uid }, // কোয়েরি: UID দিয়ে ইউজার খুঁজছি
      {
        $set: {
          email,
          fullName,
          photoURL,
          role,
          lastLogin: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true } // 💡 যদি ইউজার না থাকে, তবে ইনসার্ট করো
    );

    if (result.upsertedCount > 0) {
      // নতুন ইউজার তৈরি হয়েছে
      return res.status(201).json({
        message: "New user created in MongoDB!",
        id: result.upsertedId,
      });
    } else {
      // ইউজার আগে থেকেই ছিল, আপডেট হয়েছে
      return res.status(200).json({ message: "User data updated in MongoDB!" });
    }
  } catch (error) {
    console.error("MongoDB Save User Error:", error);
    res.status(500).json({ error: "Failed to save user data to MongoDB" });
  }
});

// Update Event
// server.js (আপডেট করা PATCH /api/events/:id রুট)
app.patch("/api/events/:id", async (req, res) => {
  try {
    const { creatorEmail } = req.body;
    if (!creatorEmail)
      return res.status(400).json({ error: "Creator email required" });
    if (!ObjectId.isValid(req.params.id))
      return res.status(400).json({ error: "Invalid event ID" });

    const database = await connectDB();
    const collection = database.collection("Create_Event");

    const event = await collection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.creatorEmail !== creatorEmail) {
      return res
        .status(403)
        .json({ error: "আপনি শুধু নিজের ইভেন্ট আপডেট করতে পারবেন" });
    }

    const updateData = { ...req.body };
    delete updateData.creatorEmail; // 💡 তারিখ হ্যান্ডলিং যোগ করা হয়েছে: eventDate থাকলে তাকে Date অবজেক্টে রূপান্তর করা

    if (updateData.eventDate) {
      updateData.eventDate = new Date(updateData.eventDate);
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json({ message: "ইভেন্ট আপডেট হয়েছে!" });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// Delete Event - এইটাই ফিক্স!
app.delete("/api/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { creatorEmail } = req.query;

    if (!id || !ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid event ID" });
    }

    if (!creatorEmail) {
      return res.status(400).json({ error: "Creator email required" });
    }

    const database = await connectDB();
    const collection = database.collection("Create_Event");

    const event = await collection.findOne({ _id: new ObjectId(id) });
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.creatorEmail !== creatorEmail) {
      return res
        .status(403)
        .json({ error: "আপনি শুধু নিজের ইভেন্ট ডিলিট করতে পারবেন" });
    }

    await collection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Event deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Ping
app.get("/ping", async (req, res) => {
  try {
    await client.db("admin").command({ ping: 1 });
    res.json({ message: "MongoDB Connected!" });
  } catch {
    res.status(500).json({ error: "MongoDB Not Connected" });
  }
});

// Server Start
app.listen(port, () => {
  console.log(`Server চলছে: http://localhost:${port}`);
  console.log(
    `My Events URL: http://localhost:${port}/api/events/my?email=your@email.com`
  );
});
