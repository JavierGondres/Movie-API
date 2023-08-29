const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");

const app = express();
admin.initializeApp({
  credential: admin.credential.cert("./permissions.json"),
  databaseURL: "https://movie-app-a8481-default-rtdb.firebaseio.com",
});
const db = admin.firestore();

// functions of movies

//agrego peliculas
app.post("/movies", async (req, res) => {
  try {
    const requiredFields = [
      "title",
      "description",
      "img",
      "stock",
      "rental_price",
      "sale_price",
      "availability",
      "likes",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Field "${field}" is required.` });
      }
    }

    const movieData = {
      title: req.body.title,
      description: req.body.description,
      img: req.body.img,
      stock: req.body.stock,
      rental_price: req.body.rental_price,
      sale_price: req.body.sale_price,
      availability: req.body.availability,
      likes: req.body.likes,
      titleToLowerCase: req.body.title.toLowerCase()
    };

    const movieRef = await db.collection("movies").add(movieData);

    return res.status(201).json({
      id: movieRef.id,
      message: "Movie created successfully.",
    });
  } catch (error) {
    console.error("Error creating movie:", error);
    return res.status(500).json({ error: "Failed to create the movie." });
  }
});

//busco las peliculas ya organizadas por title o por likes, ejemplo: movies?sortBy=title&sortOrder=asc
app.get("/movies", async (req, res) => {
  try {
    // Obtiene los parámetros de la consulta
    let { sortBy, sortOrder, page, perPage, title } = req.query;
    page = parseInt(page) || 1;
    perPage = parseInt(perPage) || 10;

    // Referencia al collection "movies"
    let query = db.collection("movies");

    //si hay un titulo me vas a buscar el objeto 
    if(title){
      query = query.where("title", "==", title)
    }

    // Ordena según los parámetros si están presentes
    if (sortBy === "likes") {
      query = query.orderBy("likes", sortOrder === "desc" ? "desc" : "asc");
    } else {
      query = query.orderBy("titleToLowerCase", sortOrder === "desc" ? "desc" : "asc");
    }

    // Realiza la consulta paginada
    const totalMovies = await query.get();

    //(1-1) * perpage = 0, entonces me vas a buscar desde la posicion cero hasta el limite que te estoy poniendo [0, perPage] = [0,1]. ejemplo2: (2-1) * perpage(2 en este caso) = 2, me mostraria desde el indice 2 y solo 2 objetos porque perPage es el limite de objetos que se pueden mostrar en una pagina.
    const startIndex = (page - 1) * perPage;

    const paginatedQuerySnapshot = await query
      .offset(startIndex)
      .limit(perPage)
      .get();
    const response = paginatedQuerySnapshot.docs.map((doc) => ({
      id: doc.id,
      movie_data: doc.data(),
    }));

    return res.status(200).json({
      total_movies: totalMovies.size,
      movies_on_page: response.length,
      movies: response,
    });
  } catch (error) {
    return res.status(500).json(error);
  }
});

// Endpoint para dar "me gusta" a una película
app.post("/movies/:movie_id/like", async (req, res) => {
  try {
    const movieRef = db.collection("movies").doc(req.params.movie_id);
    const movieDoc = await movieRef.get();

    if (!movieDoc.exists) {
      return res.status(404).json({ error: "Movie not found." });
    }

    const updatedLikes = movieDoc.data().likes + 1;

    await movieRef.update({ likes: updatedLikes });

    return res.status(200).json({ message: "Liked the movie!" });
  } catch (error) {
    return res.status(500).json({ error: "Failed to like the movie." });
  }
});

//obtengo la pelicula especifica por su id
app.get("/movies/:movie_id", async (req, res) => {
  try {
    const doc = await db.collection("movies").doc(req.params.movie_id);
    const movieItem = await doc.get();
    const response = movieItem.data();
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json(error);
  }
});

//elimino una pelicula
app.delete("/movies/:movie_id", async (req, res) => {
  try {
    const document = db.collection("movies").doc(req.params.movie_id);
    await document.delete();
    return res.status(200).json();
  } catch (error) {
    return res.status(500).json();
  }
});

//actualizo los datos de una pelicula, todo menos su availability
app.put("/movies/:movie_id", async (req, res) => {
  try {
    const requiredFields = [
      "title",
      "description",
      "img",
      "stock",
      "rental_price",
      "sale_price",
      "likes",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Field "${field}" is required.` });
      }
    }

    const movieData = {
      title: req.body.title,
      description: req.body.description,
      img: req.body.img,
      stock: req.body.stock,
      rental_price: req.body.rental_price,
      sale_price: req.body.sale_price,
      likes: req.body.likes,
    };

    const movieItem = db.collection("movies").doc(req.params.movie_id);
    await movieItem.update(movieData);

    return res.status(201).json({
      id: movieItem.id,
      message: "The data of the movie were updated succesfully.",
    });
  } catch (error) {
    console.error("Error updating the movie data:", error);
    return res.status(500).json({ error: "Error updating the movie data." });
  }
});

//actualizo el availability de una peliculca
app.patch("/movies/:movie_id/availability", async (req, res) => {
  try {
    const movieItem = db.collection("movies").doc(req.params.movie_id);
    await movieItem.update({
      availability: req.body.availability,
    });
    return res.status(200).json();
  } catch (error) {
    return res.status(500).json();
  }
});

//obtengo todas las peliculas por availabilty (true or false)
app.get("/movies/availability/:value", async (req, res) => {
  try {
    const query = db.collection("movies");
    const querySnapshot = await query.get();

    const response = querySnapshot.docs.reduce((result, doc) => {
      const availability = doc.data().availability.toString();

      if (availability === req.params.value) {
        result.push({
          id: doc.id,
          movie_data: doc.data(),
        });
      }
      return result;
    }, []);

    if (response.length === 0) {
      return res.status(404).json({
        message: "No movies found with the given availability value.",
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ error: "Something went wrong" });
  }
});
// END OF MOVIES

// users endpoints
app.post("/users", async (req, res) => {
  try {
    const requiredFields = ["name", "email", "rol"];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Field "${field}" is required.` });
      }
    }

    const userData = {
      name: req.body.name,
      email: req.body.email,
      rol: req.body.rol,
    };

    const userRef = await db.collection("users").add(userData);

    return res.status(201).json({
      //aqui se deberia de poner el id del usuario que haya iniciado sesion, por ahora  solo ira un id automatico por firestore
      id: userRef.id,
      message: "user created successfully.",
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return res.status(500).json({ error: "Failed to create the user." });
  }
});

app.get("/users", async (req, res) => {
  try {
    const userRef = db.collection("users");
    const userDoc = await userRef.get();

    const response = userDoc.docs.map((doc) => ({
      id: doc.id,
      user_data: doc.data(),
    }));
    return res.status(201).json(response);
  } catch (error) {
    console.error("Error getting users:", error);
    return res.status(500).json({ error: "Failed to get the users data." });
  }
});

app.get("/users/:user_id", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();
    const response = userDoc.data();

    return res.status(201).json(response);
  } catch (error) {
    console.error("Error getting users:", error);
    return res.status(500).json({ error: "Failed to get the users data." });
  }
});
// rental data
app.post("/users/:user_id/rented_movies", async (req, res) => {
  try {
    const requiredFields = [
      "owner_name",
      "owner_id",
      "movie_name",
      "rented_day",
      "return_day",
      "quantity",
      "delay",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Field "${field}" is required.` });
      }
    }

    const rentalData = {
      owner_name: req.body.owner_name,
      owner_id: req.body.owner_id,
      movie_name: req.body.movie_name,
      quantity: req.body.quantity,
      rented_day: req.body.rented_day,
      return_day: req.body.return_day,
      delay: req.body.delay,
    };

    console.log(req.body.rented_day);

    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const rentalsCollection = userRef.collection("rented_movies");

    const newUserRent = await rentalsCollection.add({
      owner_name: rentalData.owner_name,
      owner_id: rentalData.owner_id,
      movie_name: rentalData.movie_name,
      quantity: rentalData.quantity,
      rented_day: rentalData.rented_day,
      return_day: rentalData.return_day,
      delay: rentalData.delay,
    });

    return res
      .status(201)
      .json({ id: newUserRent.id, message: "Rental added." });
  } catch (error) {
    console.error("Error creating rental data:", error);
    return res.status(500).json({ error: "Failed to create the rental data." });
  }
});

app.get("/users/:user_id/rented_movies/:rented_id", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const rentalsCollection = userRef.collection("rented_movies");

    const rentalDoc = await rentalsCollection.doc(req.params.rented_id).get();

    if (!rentalDoc.exists) {
      return res.status(404).json({ error: "Rental not found." });
    }

    const response = rentalDoc.data();

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error getting rental data:", error);
    return res.status(500).json({ error: "Failed to get the rental data." });
  }
});

app.get("/users/:user_id/rented_movies", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const rentalsCollection = userRef.collection("rented_movies");


    const rentalDoc = await rentalsCollection.get();

    const response = rentalDoc.docs.map((doc) => ({
      id: doc.id,
      rental_data: doc.data(),
    }));

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error getting rental data:", error);
    return res.status(500).json({ error: "Failed to get the rental data." });
  }
});
// purchase data
app.post("/users/:user_id/purchases", async (req, res) => {
  try {
    const requiredFields = [
      "owner_name",
      "owner_id",
      "movie_name",
      "bought_day",
      "quantity",
    ];

    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `Field "${field}" is required.` });
      }
    }

    const rentalData = {
      owner_name: req.body.owner_name,
      owner_id: req.body.owner_id,
      movie_name: req.body.movie_name,
      quantity: req.body.quantity,
      bought_day: req.body.bought_day,
    };

    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const purchaseCollection = userRef.collection("purchases");

    const newUserPurchase = await purchaseCollection.add({
      owner_name: rentalData.owner_name,
      owner_id: rentalData.owner_id,
      movie_name: rentalData.movie_name,
      quantity: rentalData.quantity,
      bought_day: rentalData.bought_day,
    });

    return res
      .status(201)
      .json({ id: newUserPurchase.id, message: "Purchase added." });
  } catch (error) {
    console.error("Error creating purchase data:", error);
    return res
      .status(500)
      .json({ error: "Failed to create the purchase data." });
  }
});

app.get("/users/:user_id/purchases/:purchase_id", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const purchaseCollection = userRef.collection("purchases");

    const purchaseDoc = await purchaseCollection
      .doc(req.params.purchase_id)
      .get();

    if (!purchaseDoc.exists) {
      return res.status(404).json({ error: "purchase not found." });
    }

    const response = purchaseDoc.data();

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error getting purchase data:", error);
    return res.status(500).json({ error: "Failed to get the purchase data." });
  }
});

app.get("/users/:user_id/purchases", async (req, res) => {
  try {
    const userRef = db.collection("users").doc(req.params.user_id);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found." });
    }

    const purchasesCollection = userRef.collection("purchases");

    const purchaseDoc = await purchasesCollection.get();

    const response = purchaseDoc.docs.map((doc) => ({
      id: doc.id,
      purchase_data: doc.data(),
    }));

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error getting purchase data:", error);
    return res.status(500).json({ error: "Failed to get the purchase data." });
  }
});

exports.app = functions.https.onRequest(app);
