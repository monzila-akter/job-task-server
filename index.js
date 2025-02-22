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
      

 // GET - Retrieve Tasks for a Specific User
app.get("/tasks", async (req, res) => {
    const { uid } = req.query; // Get uid from query params
    if (!uid) return res.status(400).json({ error: "User ID is required" });

    try {
        const tasks = await taskCollection.find({ uid }).toArray(); // Fetch tasks only for this user
        res.json(tasks);
    } catch (error) {
        console.error("Error retrieving tasks:", error);
        res.status(500).json({ error: "Failed to retrieve tasks" });
    }
});

app.post("/tasks", async (req, res) => {
    const { title, description, status, uid } = req.body;
  
    if (!title || title.length > 50) return res.status(400).json({ error: "Title is required (max 50 chars)" });
    if (description && description.length > 200) return res.status(400).json({ error: "Description max 200 chars" });
    if (!uid) return res.status(400).json({ error: "User ID is required" });
  
    try {
      // Find the maximum order value for tasks in the same column
      const maxOrderTask = await taskCollection
        .find({ status, uid }) // Filter by status and user ID
        .sort({ order: -1 }) // Sort in descending order
        .limit(1)
        .toArray();
  
      const newOrder = maxOrderTask.length > 0 ? maxOrderTask[0].order + 1 : 0; // Set the new order
  
      const newTask = { title, description, status, createdAt: new Date(), order: newOrder, uid }; // Add order field
      const result = await taskCollection.insertOne(newTask);
  
      io.emit("task-updated"); // Notify all clients about the change
      res.json(result);
    } catch (error) {
      console.error("Error adding task:", error);
      res.status(500).json({ error: "Failed to add task" });
    }
  });

 // PUT - Update Task (Only for the task owner)
app.put("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const { uid, ...updateFields } = req.body; // Extract uid and other fields

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Task ID" });
    if (!uid) return res.status(400).json({ error: "User ID is required" });

    try {
        // Check if the task belongs to the user
        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task || task.uid !== uid) {
            return res.status(403).json({ error: "You are not authorized to update this task" });
        }

        const result = await taskCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );

        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: "Task not found or not modified" });
        }

        io.emit("task-updated");
        res.json({ message: "Task updated successfully" });
    } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).json({ error: "Failed to update task" });
    }
});

app.put("/tasks/reorder/:id", async (req, res) => {
    try {
      const { order, status, uid } = req.body; // Updated order and status
      const taskId = req.params.id; // Task ID from the URL
  
      // Validate if 'order' is provided
      if (typeof order === "undefined") {
        return res.status(400).json({ error: "Order value is required" });
      }
  
      // Check if the taskId is a valid ObjectId
      if (!ObjectId.isValid(taskId)) {
        return res.status(400).json({ error: "Invalid Task ID format" });
      }
  
      // Check if the task belongs to the user
      const task = await taskCollection.findOne({ _id: new ObjectId(taskId) });
      if (!task || task.uid !== uid) {
        return res.status(403).json({ error: "You are not authorized to update this task" });
      }
  
      // Update the task's order and status
      const updatedTask = await taskCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: { order, status } } // Update both order and status
      );
  
      if (updatedTask.modifiedCount === 0) {
        return res.status(404).json({ error: "Task not found or no changes made" });
      }
  
      // Reorder all tasks in the same column
      const tasksInColumn = await taskCollection
        .find({ status, uid }) // Filter by status and user ID
        .sort({ order: 1 }) // Sort in ascending order
        .toArray();
  
      tasksInColumn.forEach(async (task, index) => {
        if (task.order !== index) {
          await taskCollection.updateOne(
            { _id: task._id },
            { $set: { order: index } } // Update the order field
          );
        }
      });
  
      io.emit("task-updated"); // Notify all clients about the change
      res.status(200).json({ message: "Task order updated successfully" });
    } catch (error) {
      console.error("Error updating task order:", error);
      res.status(500).json({ error: "Error updating task order" });
    }
  });

 // DELETE - Remove a Task (Only for the task owner)
app.delete("/tasks/:id", async (req, res) => {
    const { id } = req.params;
    const { uid } = req.body; // Get uid from request body

    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid Task ID" });
    if (!uid) return res.status(400).json({ error: "User ID is required" });

    try {
        // Check if the task belongs to the user
        const task = await taskCollection.findOne({ _id: new ObjectId(id) });
        if (!task || task.uid !== uid) {
            return res.status(403).json({ error: "You are not authorized to delete this task" });
        }

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