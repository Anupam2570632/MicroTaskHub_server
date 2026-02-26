const express = require("express");
const cors = require("cors");
const app = express();

const port = 3000;
require("dotenv").config();

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://microtaskhub.netlify.app",
    ],
    credentials: true,
  }),
);
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

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
    const tasksCollection = client.db("MicroTaskHub").collection("tasks");
    const withdrawCollection = client
      .db("MicroTaskHub")
      .collection("withdrawals");
    const submissionsCollection = client
      .db("MicroTaskHub")
      .collection("submissions");

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

        const serverData = await usersCollection.findOne({ email });

        res.send(serverData);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server error" });
      }
    });

    app.post("/createTasks", async (req, res) => {
      const session = client.startSession();

      try {
        const { creator_email, task_quantity, payable_amount, ...taskData } =
          req.body;

        const totalCost = task_quantity * payable_amount;

        session.startTransaction();

        // 1️⃣ Find user
        const user = await usersCollection.findOne(
          { email: creator_email },
          { session },
        );

        if (!user) {
          await session.abortTransaction();
          return res.status(404).send({ message: "User not found" });
        }

        if (user.coins < totalCost) {
          await session.abortTransaction();
          return res.status(400).send({ message: "Insufficient coins" });
        }

        // 2️⃣ Deduct coins
        await usersCollection.updateOne(
          { email: creator_email },
          { $inc: { coins: -totalCost } },
          { session },
        );

        // 3️⃣ Create task
        const task = {
          ...taskData,
          creator_email,
          task_quantity,
          payable_amount,
          total_cost: totalCost,
          status: "active",
          createdAt: new Date(),
        };

        const result = await tasksCollection.insertOne(task, { session });

        await session.commitTransaction();

        res.send({
          success: true,
          taskId: result.insertedId,
          remainingCoins: user.coins - totalCost,
        });
      } catch (error) {
        await session.abortTransaction();
        res.status(500).send({ message: "Task creation failed" });
      } finally {
        await session.endSession();
      }
    });

    //get all tasks api
    app.get("/getTasks", async (req, res) => {
      const tasks = await tasksCollection.find().toArray();
      res.send(tasks);
    });

    //get specific task with id
    app.get("/tasks/:id", async (req, res) => {
      try {
        const id = req.params.id;

        // Validate ObjectId
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "Invalid Task ID" });
        }

        const query = { _id: new ObjectId(id) };
        const task = await tasksCollection.findOne(query);

        if (!task) {
          return res.status(404).send({ message: "Task Not Found" });
        }

        res.send(task);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Server Error" });
      }
    });

    //post submission api
    app.post("/submissions", async (req, res) => {
      try {
        const submission = req.body;

        const result = await submissionsCollection.insertOne(submission);

        res.status(201).send({
          success: true,
          message: "Submission saved successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Failed to save submission",
        });
      }
    });

    //get Submission api
    app.get("/submissions", async (req, res) => {
      try {
        const workerEmail = req.query.email;

        const query = { worker_email: workerEmail };

        const result = await submissionsCollection
          .find(query)
          .sort({ current_date: -1 })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch submissions" });
      }
    });

    //get review request api with creator email
    app.get("/review-requests", async (req, res) => {
      try {
        const creatorEmail = req.query.email;

        const query = {
          creator_email: creatorEmail,
          status: "pending",
        };

        const result = await submissionsCollection.find(query).toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch review requests" });
      }
    });

    // Update Submission Status (Approve / Reject)
    app.patch("/update-submission-status/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        const submission = await submissionsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!submission) {
          return res.status(404).send({ message: "Submission not found" });
        }

        if (submission.status !== "pending") {
          return res.status(400).send({
            message: "Submission already reviewed",
          });
        }

        // 1️⃣ Update submission status
        await submissionsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } },
        );

        // 2️⃣ If approved → increase coin
        if (status === "approved") {
          await usersCollection.updateOne(
            { email: submission.worker_email },
            { $inc: { coins: parseInt(submission.payable_amount) } },
          );
        }

        res.send({
          success: true,
          message: `Submission ${status}`,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Update failed" });
      }
    });

    //post withdrawal request api
    app.post("/withdraw", async (req, res) => {
      try {
        const {
          worker_email,
          worker_name,
          withdraw_coin,
          withdraw_amount,
          payment_system,
          account_number,
        } = req.body;

        // 1️⃣ Find worker
        const user = await usersCollection.findOne({
          email: worker_email,
        });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        const maxDollar = Math.floor(user.coins / 20);

        // 2️⃣ Validate withdraw amount
        if (withdraw_amount > maxDollar || withdraw_coin > user.coins) {
          return res.status(400).send({
            success: false,
            message: "Withdraw amount exceeds limit",
          });
        }

        // 3️⃣ Deduct coins
        await usersCollection.updateOne(
          { email: worker_email },
          { $inc: { coins: -withdraw_coin } },
        );

        // 4️⃣ Insert withdraw record
        const withdrawData = {
          worker_email,
          worker_name,
          withdraw_coin,
          withdraw_amount,
          payment_system,
          account_number,
          withdraw_time: new Date(),
        };

        await withdrawCollection.insertOne(withdrawData);

        res.send({
          success: true,
          message: "Withdraw Request Successful",
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({
          success: false,
          message: "Withdraw failed",
        });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
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
