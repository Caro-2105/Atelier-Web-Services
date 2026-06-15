require("dotenv").config();
const soap = require("soap");
const fs = require("node:fs");
const http = require("http");

const { Pool } = require("pg");

const sql = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const service = {
  ProductsService: {
    ProductsPort: {
      
        // --- CREATE PRODUCT ---
        CreateProduct: async function ({ name, about, price }, callback) {
            if (!name || !about || !price) {
            throw {
                Fault: {
                Code: {
                    Value: "soap:Sender",
                    Subcode: { value: "rpc:BadArguments" },
                },
                Reason: { Text: "Processing Error" },
                statusCode: 400,
                },
            };
            }

            try {
            const query = `
                INSERT INTO products (name, about, price)
                VALUES ($1, $2, $3)
                RETURNING *
            `;
            const values = [name, about, price];

            const result = await sql.query(query, values);

            callback(result.rows[0]);

            } catch (error) {
            console.error(error);
            throw {
                Fault: {
                Code: { Value: "soap:Receiver" },
                Reason: { Text: "Database Error: " + error.message },
                },
            };
            }
        },

        GetProducts: async function (args, callback) {
            try {
                const query = "SELECT * FROM products ORDER BY id ASC";
                const result = await sql.query(query);

                console.log("Produits trouvés :", result.rowCount);

                callback(result.rows);

            } catch (error) {
                console.error(error);
                throw {
                    Fault: {
                        Code: { Value: "soap:Receiver" },
                        Reason: { Text: "Error fetching products: " + error.message },
                    }
                };
            }
        },

        PatchProduct: async function ({ id, name, about, price }, callback) {
            if (!id) {
            throw {
                Fault: {
                Code: { Value: "soap:Sender", Subcode: { value: "rpc:BadArguments" } },
                Reason: { Text: "ID is required for patching" },
                statusCode: 400,
                },
            };
            }

            try {
            const query = `
                UPDATE products 
                SET name = COALESCE($2, name), 
                    about = COALESCE($3, about), 
                    price = COALESCE($4, price)
                WHERE id = $1
                RETURNING *
            `;

            const values = [id, name || null, about || null, price || null];
            const result = await sql.query(query, values);

            if (result.rowCount === 0) {
                throw new Error("Product not found");
            }

            callback({ product: result.rows[0] });

            } catch (error) {
                console.error(error);
                throw {
                    Fault: {
                    Code: { Value: "soap:Receiver" },
                    Reason: { Text: "Error updating product: " + error.message },
                    },
                };
            }
        },

        DeleteProduct: async function ({ id }, callback) {
            if (!id) {
                throw {
                    Fault: {
                    Code: { Value: "soap:Sender", Subcode: { value: "rpc:BadArguments" } },
                    Reason: { Text: "ID is required for deletion" },
                    statusCode: 400,
                    },
                };
            }

            try {
                const query = "DELETE FROM products WHERE id = $1";
                const result = await sql.query(query, [id]);

                if (result.rowCount === 0) {
                    throw new Error("Product ID not found");
                }

                callback({ success: true });

            } catch (error) {
                console.error(error);
                throw {
                    Fault: {
                    Code: { Value: "soap:Receiver" },
                    Reason: { Text: "Error deleting product: " + error.message },
                    },
                };
            }
        },
        
        },
    },
};

const server = http.createServer(function (request, response) {
  response.end("404: Not Found: " + request.url);
});

server.listen(8000);

// Assurez-vous que le fichier WSDL est bien mis à jour avec les 3 opérations
const xml = fs.readFileSync("productsService.wsdl", "utf8");

soap.listen(server, "/products", service, xml, function () {
  console.log("SOAP server running at http://localhost:8000/products?wsdl");
});