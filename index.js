const express = require("express");
const cors = require("cors");
const app = express();

const port = 3000;
require("dotenv").config();

app.use(
  cors({
    origin: ["http://localhost:5173", "https://microtaskhub.netlify.app"],
  })
);
app.use(express.json());

const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oeipnk8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection

    const usersCollection = client.db("MicroTaskHub").collection("users");

    app.get("/", (req, res) => {
      res.send("HEllo......");
    });

    app.post("/users", async (req, res) => {
      const { name, email, role, imageUrl } = req.body;
      const query = { email: email };

      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists" });
      }

      const newUser = {
        fullName: name,
        email,
        role,
        profileImage: imageUrl,
        coins: 10,
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.post("/register", async (req, res) => {
      try {
        const { fullName, email, role, profileImage } = req.body;

        console.log(profileImage);

        // Validate input
        if (!fullName || !email || !role) {
          return res.status(400).json({ message: "All fields are required" });
        }

        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
          return res.status(409).json({ message: "Email already exists" });
        }

        const coins = role === "Worker" ? 10 : 20;

        // Create new user
        const newUser = {
          fullName,
          email,
          role,
          profileImage: profileImage || "",
          coins,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);

        res.status(201).json({
          message: "User registered successfully!",
          user: {
            id: result.insertedId,
            fullName,
            email,
            role,
            profileImage,
            coins,
          },
        });
      } catch (error) {
        console.error("Registration Error:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    app.get("/user", async (req, res) => {
      try {
        const email = req.query.email;

        const serverData = await usersCollection.find({ email }).toArray();

        res.send(serverData);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
