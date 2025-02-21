const express = require('express');
const cors = require('cors');
const app = express();
const http = require("http"); // Required for WebSockets
const { Server } = require("socket.io");
const port = process.env.PORT || 5000;
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors());
app.use(express.json());

// Create HTTP server for WebSockets
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vo9th.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

     const taskCollection = client.db("TaskDB").collection("tasks");
     const userCollection = client.db("TaskDB").collection("users");

        //  **WebSocket Connection**
    io.on("connection", (socket) => {
        console.log("A user connected ");
  
        socket.on("disconnect", () => {
          console.log("User disconnected ");
        });
      });

// post user data
      app.post("/users", async (req, res) => {
        const { uid, email, displayName } = req.body;
      
        if (!uid || !email || !displayName) {
          return res.status(400).json({ error: "Missing user details" });
        }
      
        try {
          const existingUser = await userCollection.findOne({ uid });
      
          if (!existingUser) {
            const newUser = { uid, email, displayName, createdAt: new Date() };
            await userCollection.insertOne(newUser);
            return res.status(201).json({ message: "User added successfully" });
          }
      
          res.status(200).json({ message: "User already exists" });
        } catch (error) {
          console.error("Error saving user:", error);
          res.status(500).json({ error: "Failed to save user" });
        }
      });
      

// GET - Retrieve Tasks for a specific user
app.get("/tasks/:uid", async (req, res) => {
    const { uid } = req.params;
    try {
        const tasks = await taskCollection.find({ uid }).toArray();
        res.json(tasks);
    } catch (error) {
        console.error("Error retrieving tasks:", error);
        res.status(500).json({ error: "Failed to retrieve tasks" });
    }
});


// POST - Add a Task (Include order field and uid)
app.post("/tasks", async (req, res) => {
    const { title, description, status, uid } = req.body;

    if (!title || title.length > 50) return res.status(400).json({ error: "Title is required (max 50 chars)" });
    if (description && description.length > 200) return res.status(400).json({ error: "Description max 200 chars" });
    if (!uid) return res.status(400).json({ error: "User ID is required" });

    const newTask = { title, description, status, createdAt: new Date(), order: 0, uid }; // Adding default order and uid
    try {
        const result = await taskCollection.insertOne(newTask);
        io.emit("task-updated");
        res.json(result);
    } catch (error) {
        console.error("Error adding task:", error);
        res.status(500).json({ error: "Failed to add task" });
    }
});

// PUT - Update Task (Edit & Drag Functionality Combined)
app.put("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const updateFields = req.body; // Can contain title, description, or status

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid Task ID" });
    }

    try {
        const result = await taskCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields } // Dynamically update provided fields
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "Task not found or not modified" });
        }

        io.emit("task-updated"); // Notify all clients about the change
        res.json({ message: "Task updated successfully" });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ error: "Failed to update task" });
    }
});

app.put("/tasks/reorder/:id", async (req, res) => {
    try {
      const { order } = req.body; // Updated order value
      const taskId = req.params.id; // Task ID from the URL
      console.log("order", order, "taskId", taskId);
  
      // Validate if 'order' is provided
      if (typeof order === "undefined") {
        return res.status(400).json({ error: "Order value is required" });
      }
  
      // Check if the taskId is a valid ObjectId
      if (!ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: "Invalid Task ID format" });
      }
  
      // Find the task by its ID and update only the 'order' field
      const updatedTask = await taskCollection.updateOne(
        { _id: new ObjectId(taskId) }, // Convert string to ObjectId
        { $set: { order: order } } // Update the 'order' field
      );
      console.log("updateTask", updatedTask);
  
      if (updatedTask.modifiedCount === 0) {
        return res
          .status(404)
          .json({ error: "Task not found or no changes made" });
      }
  
      res.status(200).json({ message: "Task order updated successfully" });
    } catch (error) {
      console.error("Error updating task order:", error);
      res.status(500).json({ error: "Error updating task order" });
    }
  });
  
  
// DELETE - Remove a Task
app.delete("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const result = await taskCollection.deleteOne({ _id: new ObjectId(id) });
        io.emit("task-updated");
        res.json({ message: "Task deleted" });
    } catch (error) {
        console.error("Error deleting task:", error);
        res.status(500).json({ error: "Failed to delete task" });
    }
});
          
  

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('task is falling from sky')
})

server.listen(port, () => {
    console.log(`Task is running at port: ${port}`)
})