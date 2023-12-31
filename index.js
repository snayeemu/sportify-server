const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const cors = require("cors");

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization)
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });

  // b token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err)
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });

    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ttlimcj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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

    const userCollection = client.db("campDb").collection("users");
    const classCollection = client.db("campDb").collection("classes");
    const paymentCollection = client.db("campDb").collection("payments");

    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1w",
      });

      res.send({ token });
    });

    app.get("/userInfo/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });

    app.get("/payments/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await paymentCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    app.get("/allClasses", async (req, res) => {
      const classes = await classCollection
        .find()
        .sort({ studentEnrolled: -1 })
        .toArray();
      res.send(classes);
    });

    app.get("/allUsers", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    app.get("/aClass/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classCollection.findOne(query);
      res.send(result);
    });

    app.get("/classes/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const classes = await classCollection.find().toArray();
      let result;
      if (user?.enrolledClass) {
        result = classes.filter((aClass) =>
          user.enrolledClass.includes(aClass._id + "")
        );
      } else result = [];
      res.send(result);
    });

    app.get("/allInstructors", async (req, res) => {
      const query = { isInstructor: true };
      const instructors = await userCollection.find(query).toArray();
      res.send(instructors);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) return res.send({ message: "already exists" });

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.post("/addClass", async (req, res) => {
      const aClass = req.body;

      const result = await classCollection.insertOne(aClass);
      res.send(result);
    });

    // app.patch("/makeAllInstructor", async (req, res) => {
    //   const query = {};
    //   const updateDoc = {
    //     $set: {
    //       isInstructor: true,
    //     },
    //   };
    //   const result = await userCollection.updateMany(query, updateDoc);
    //   res.send(result);
    // });

    app.patch("/addClass", async (req, res) => {
      const classId = req.query.classId;
      const userEmail = req.query.userEmail;
      const userQuery = { email: userEmail };
      let user = await userCollection.findOne(userQuery);
      if (user?.takenClass) {
        const previousClass = user.takenClass;
        user = {
          $set: {
            takenClass: [...previousClass, classId],
          },
        };
      } else if (user) {
        user = {
          $set: {
            takenClass: [classId],
          },
        };
      } else return res.send({ error: "user not found" });

      const result = await userCollection.updateOne(userQuery, user);
      res.send(result);
    });

    app.patch("/deleteClass", async (req, res) => {
      const classId = req.query.classId;
      const email = req.query.userEmail;
      const userQuery = { email: email };
      let user = await userCollection.findOne(userQuery);
      if (user) {
        const previousClasses = user.takenClass;
        user = {
          $set: {
            takenClass: previousClasses.filter((id) => id !== classId),
          },
        };
      } else return res.send({ error: "user not found" });

      const deleteResult = await userCollection.updateOne(userQuery, user);
      res.send(deleteResult);
    });

    app.patch("/makeInstructor", async (req, res) => {
      const email = req.query.email;
      const userQuery = { email: email };
      let user = await userCollection.findOne(userQuery);
      if (user) {
        user = {
          $set: {
            isInstructor: true,
          },
        };
      } else return res.send({ error: "user not found" });

      const result = await userCollection.updateOne(userQuery, user);
      res.send(result);
    });

    app.patch("/makeAdmin", async (req, res) => {
      const email = req.query.email;
      const userQuery = { email: email };
      let user = await userCollection.findOne(userQuery);
      if (user) {
        user = {
          $set: {
            isAdmin: true,
          },
        };
      } else return res.send({ error: "user not found" });

      const result = await userCollection.updateOne(userQuery, user);
      res.send(result);
    });

    app.patch("/updateClass/:id", async (req, res) => {
      const classId = req.params.id;
      console.log(classId);
      const query = { _id: new ObjectId(classId) };
      let aClass = await classCollection.findOne(query);
      if (aClass && aClass?.availableSeat > 1) {
        const previousSeat = aClass.availableSeat;
        const previousEnrolled = aClass.studentEnrolled;
        aClass = {
          $set: {
            availableSeat: previousSeat - 1,
            studentEnrolled: previousEnrolled + 1,
          },
        };
      } else if (aClass && aClass?.availableSeat === 0) {
        return res.send({ error: "seat not available" });
      } else return res.send({ error: "class not found" });

      const result = await classCollection.updateOne(query, aClass);
      res.send(result);
    });

    app.patch("/updateStatus", async (req, res) => {
      const classId = req.query.classId;
      const status = req.query.status;
      const query = { _id: new ObjectId(classId) };
      let aClass = await classCollection.findOne(query);
      if (aClass) {
        aClass = {
          $set: {
            status: status,
          },
        };
      } else return res.send({ error: "class not found" });

      const result = await classCollection.updateOne(query, aClass);
      res.send(result);
    });

    app.patch("/feedback", async (req, res) => {
      const feedbackIfo = req.body;
      const classId = feedbackIfo.id;
      const feedback = feedbackIfo.feedback;
      const query = { _id: new ObjectId(classId) };
      let aClass = await classCollection.findOne(query);
      if (aClass) {
        aClass = {
          $set: {
            feedback: feedback,
          },
        };
      } else return res.send({ error: "class not found" });

      const result = await classCollection.updateOne(query, aClass);
      res.send(result);
    });

    const calculateOrderAmount = (items) => {
      // Replace this constant with a calculation of the order's amount
      // Calculate the order total on the server to prevent
      // people from directly manipulating the amount on the client
      return items * 100;
    };

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: calculateOrderAmount(price),
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentCollection.insertOne(payment);
      const userQuery = { email: payment.email };
      let user = await userCollection.findOne(userQuery);

      if (user) {
        const previousClasses = user.takenClass;
        const enrolledClass = user?.enrolledClass || [];
        user = {
          $set: {
            takenClass: previousClasses.filter((id) => id !== payment.classId),
            enrolledClass: [...enrolledClass, payment.classId],
          },
        };
      } else return res.send({ error: "user not found" });

      const deleteResult = await userCollection.updateOne(userQuery, user);

      res.send({ insertResult, deleteResult });
    });

    // Send a ping to confirm a successful connection]
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

app.get("/", (req, res) => {
  res.send("summer camp is running");
});

app.listen(port, () => {
  console.log(`Summer camp is running on on port ${port}`);
});
