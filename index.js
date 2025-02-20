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
    await client.connect();

     const taskCollection = client.db("TaskDB").collection("tasks");

        //  **WebSocket Connection**
    io.on("connection", (socket) => {
        console.log("A user connected ");
  
        socket.on("disconnect", () => {
          console.log("User disconnected ");
        });
      });
 // GET - Retrieve Tasks
 app.get("/tasks", async (req, res) => {
    try {
      const tasks = await taskCollection.find().toArray();
      res.json(tasks);
    } catch (error) {
      console.error("Error retrieving tasks:", error);
      res.status(500).json({ error: "Failed to retrieve tasks" });
    }
  });

 // POST - Add a Task (Include order field)
app.post("/tasks", async (req, res) => {
    const { title, description, status } = req.body;

    if (!title || title.length > 50) return res.status(400).json({ error: "Title is required (max 50 chars)" });
    if (description && description.length > 200) return res.status(400).json({ error: "Description max 200 chars" });

    const newTask = { title, description, status, createdAt: new Date(), order: 0 }; // Adding default order
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
app.put('/tasks/reorder', async (req, res) => {
    try {
      const tasks = req.body.reorderedTasks; // Array of tasks with updated order
      // Update the task order in the database
      await tasks.bulkWrite(
        tasks.map((task) => ({
          updateOne: {
            filter: { _id: task._id },
            update: { $set: { order: task.order, status: task.status } },
          },
        }))
      );
      res.status(200).send('Tasks reordered successfully');
    } catch (error) {
      res.status(500).send('Error updating task order');
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
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
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