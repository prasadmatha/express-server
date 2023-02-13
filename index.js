const express = require("express");
const app = express();
const process = require("process");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const _ = require("lodash");
const cors = require("cors");
const dotenv = require("dotenv");
require("dotenv").config();
const regex = require("./regex");
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
dotenv.config();
let db = null;
const initializedbAndServer = async () => {
  try {
    db = await open({
      filename: path.join(__dirname, "data.db"),
      driver: sqlite3.Database,
    });
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (e) {
    console.log(`DB Error :: ${e.message}`);
    process.exit(1);
  }
};

initializedbAndServer();

const getData = async (entity) => {
  let query = `select * from ${entity} order by id asc;`;
  let dbResponse = await db.all(query);
  return dbResponse;
};

let mandatoryFields = {
  userInfo: ["name", "email", "password", "mobile"],
  cardInfo: ["email", "cardNumber", "nameOnCard", "expDate", "cvv"],
  tokenInfo: ["domainName"],
};

let duplicateFields = {
  userInfo: ["email", "mobile"],
  cardInfo: ["cardNumber"],
};

const checkForMandatoryFields = (data) => {
  let errors = [];
  let entity = Object.keys(data);
  data = data[entity];
  let KeysInattributesOfDataObject = Object.keys(data);
  let mandatoryFieldsOfEntity = mandatoryFields[entity];
  mandatoryFieldsOfEntity.forEach((each) => {
    if (
      !each in KeysInattributesOfDataObject ||
      !data[each] ||
      !regex[each].test(data[each])
    ) {
      errors.push(each);
    }
  });
  return errors;
};

const checkDuplicateFields = (data, reqBody) => {
  let errors = [];
  let entity = Object.keys(reqBody);
  reqBody = reqBody[entity];
  data.forEach((entry) => {
    for (let eachField of duplicateFields[entity]) {
      if (entry[eachField] == reqBody[eachField]) {
        errors.push(eachField);
      }
    }
  });
  return errors;
};

//creating customer
app.post("/create/customer", async (req, res) => {
  let data = await getData("user");
  let reqBody = req.body;
  let isObjectNull = Object.keys(reqBody).length == 0 ? true : false;
  let mandatoryFieldserrors = !isObjectNull
    ? checkForMandatoryFields({ userInfo: { ...reqBody } })
    : "";
  if (!isObjectNull) {
    if (!mandatoryFieldserrors.length) {
      if (!data.length) {
        let hashedPassword = await bcrypt.hash(reqBody.password, 10);
        reqBody.password = hashedPassword;
        let { name, mobile, email, password } = reqBody;
        let query = `insert into user(id,name,mobile,email,password) values(
          1,'${name}','${mobile}','${email}','${password}'
        )`;
        let dbResponse = await db.run(query);
        let { lastID } = dbResponse;
        res.status(200).send({
          isSuccessful: true,
          message: `user is created successfully with the id :: ${lastID}`,
        });
      } else {
        let duplicateFieldsErrors = checkDuplicateFields(data, {
          userInfo: { ...reqBody },
        });
        if (!duplicateFieldsErrors.length) {
          let lengthOfData = data.length;
          let id = data[lengthOfData - 1].id + 1;
          let hashedPassword = await bcrypt.hash(reqBody.password, 10);
          reqBody.password = hashedPassword;
          let { name, mobile, email, password } = reqBody;
          let query = `insert into user(id,name,mobile,email,password) values(
          '${id}','${name}','${mobile}','${email}','${password}'
        )`;
          let dbResponse = await db.run(query);
          res.status(200).send({
            isSuccessful: true,
            message: `user is created successfully with the id :: ${id}`,
          });
        } else {
          res.status(400).send({
            isSuccessful: false,
            message: `duplicate fields already exists :: ${duplicateFieldsErrors.join(
              ", "
            )}`,
          });
        }
      }
    } else {
      res.status(400).send({
        isSuccessful: false,
        message: `Mandatory fields should be provided with valid data :: ${mandatoryFieldserrors.join(
          ", "
        )}`,
      });
    }
  } else {
    res.status(400).send({
      isSuccessful: false,
      message: `Request body should not be empty`,
    });
  }
});

//user login
app.post("/login", async (req, res) => {
  let body = req.body;
  let isBodyEmpty = Object.keys(body).length == 0 ? true : false;
  if (!isBodyEmpty) {
    if (regex.email.test(body.email) && regex.password.test(body.password)) {
      let getUserQuery = `select * from user where email = '${body.email}'`;
      let dbResponse = await db.get(getUserQuery);
      if (dbResponse != undefined) {
        let dbPassword = dbResponse.password;
        let isPasswordMatched = await bcrypt.compare(body.password, dbPassword);
        if (isPasswordMatched) {
          let user_id = dbResponse.id;
          let getCardsDataQuery = `select * from user inner join card on user.id = card.user_id where card.user_id = ${user_id} `;
          let cardsDBResponse = await db.all(getCardsDataQuery);
          if (cardsDBResponse.length) {
            res.status(200).send({
              isSuccessful: true,
              message: "Received User details successfully",
              response: cardsDBResponse,
            });
          } else {
            res.status(200).send({
              isSuccessful: true,
              message: "No cards exists, received user details only",
              response: [dbResponse],
            });
          }
        } else {
          res
            .status(400)
            .send({ isSuccessful: false, message: "Wrong Password" });
        }
      } else {
        res
          .status(400)
          .send({ isSuccessful: false, message: "Email ID is not registered" });
      }
    } else {
      res.status(400).send({
        isSuccessful: false,
        message: "Please provide valid email ID or Password",
      });
    }
  } else {
    res.status(400).send({
      isSuccessful: false,
      message: "Request body should not be empty",
    });
  }
});

app.get("/users", async (req, res) => {
  let dbResponse = await getData("user");
  res.send(dbResponse);
});

//create token
app.get("/user/:id/card/:cardID/tokens", async (req, res) => {
  let userID = req.params.id;
  let cardID = req.params.cardID;
  let dbResponse = await db.get(`select * from user where id = ${userID}`);
  if (dbResponse != undefined) {
    const cardIDQuery = `select * from card where id = ${cardID} and user_id = ${userID}`;
    dbResponse = await db.get(cardIDQuery);
    if (dbResponse != undefined) {
      let { id } = dbResponse;
      let getTokensQuery = `select * from token where card_id = ${id} and status != "InActive"`;
      dbResponse = await db.all(getTokensQuery);
      if (dbResponse.length) {
        res.status(200).send({
          isSuccessful: true,
          message: "Received tokens successfully",
          response: dbResponse,
        });
      } else {
        res.status(404).send({
          isSuccessful: false,
          message: "No Tokens were created for this card",
        });
      }
    } else {
      res.status(400).send({
        isSuccessful: false,
        message: "card not exists with this user",
      });
    }
  } else {
    res.status(400).send({
      isSuccessful: false,
      message: `No user exists with the id :: ${userID}`,
    });
  }
});

app.post("/user/:id/tokens/:tokenId/info", (req, res) => {});

//creating card
app.post("/create/card", async (req, res) => {
  let body = req.body;
  let usersData = await getData("user");
  let isObjectNull = Object.keys(body).length == 0 ? true : false;
  let mandatoryFieldserrors = !isObjectNull
    ? checkForMandatoryFields({ cardInfo: { ...body } })
    : "";
  if (!isObjectNull) {
    if (!mandatoryFieldserrors.length) {
      let { email, cardNumber, nameOnCard, expDate, cvv } = body;
      let userFound = usersData.filter((user) => {
        if (user.email == email.toLowerCase()) {
          return user;
        }
      });
      if (userFound.length) {
        let { id } = userFound[0];
        let cardsData = await getData("card");
        if (cardsData.length) {
          let duplicateCard = cardsData.filter(
            (card) => card.card_number == body.cardNumber
          );
          duplicateCard = duplicateCard.length ? true : false;
          if (!duplicateCard) {
            let cardID = cardsData[cardsData.length - 1].id + 1;
            let query = `insert into card(id,user_id,name_on_card,card_number,exp_date,cvv) values(
            ${cardID},${id},'${nameOnCard}','${cardNumber}','${expDate}','${cvv}')`;
            let dbResponse = await db.run(query);
            res.send({
              isSuccessful: true,
              message: `Card details are saved successfully`,
            });
          } else {
            res.status(400).send({
              isSuccessful: false,
              message: `Duplicate Card Number`,
            });
          }
        } else {
          let query = `insert into card(id,user_id,name_on_card,card_number,exp_date,cvv) values(
        1,${id},'${nameOnCard}','${cardNumber}','${expDate}','${cvv}'
      )`;
          let dbResponse = await db.run(query);
          res.send({
            isSuccessful: true,
            message: `Card details are saved successfully`,
          });
        }
      } else {
        res
          .status(400)
          .send({ isSuccessful: false, message: "Email ID is not registered" });
      }
    } else {
      res.status(400).send({
        isSuccessful: false,
        message: `Mandatory fields should be provided with valid data :: ${mandatoryFieldserrors.join(
          ", "
        )}`,
      });
    }
  } else {
    res.status(400).send({
      isSuccessful: false,
      message: "Request body should not be empty",
    });
  }
});

//creating token
app.post("/user/:id/card/:cardID/create/token", async (req, res) => {
  let body = req.body;
  let { id, cardID } = req.params;
  let { email, domainName } = body;
  let isObjectNull = Object.keys(body).length == 0 ? true : false;
  let mandatoryFieldserrors = !isObjectNull
    ? checkForMandatoryFields({ tokenInfo: { ...body } })
    : "";
  if (!isObjectNull) {
    if (!mandatoryFieldserrors.length) {
      let user = await db.get(`select * from user where id = ${id}`);
      if (user != undefined) {
        let getCardsDetailsQuery = `select * from card where user_id = ${id} and id = ${cardID}`;
        let cardFound = await db.get(getCardsDetailsQuery);
        if (cardFound != undefined) {
          let getTokenQuery = `select * from token where card_id = ${cardID} and domain_name = '${domainName}' and status = "Active"`;
          let tokensData = await db.get(getTokenQuery);
          if (tokensData != undefined) {
            res.status(400).send({
              isSuccessful: false,
              message: "Active token already exists for this domain",
            });
          } else {
            let latestTokenID = await db.get(
              `select id from token order by id desc limit 1 offset 0`
            );
            console.log(latestTokenID);
            latestTokenID = latestTokenID.id + 1;
            let token_number =
              Math.random().toFixed(13).split(".")[1] +
              latestTokenID +
              id +
              cardID;
            let dbResponse =
              await db.run(`insert into token (id,card_id,token_number,domain_name,status) 
            values(${latestTokenID},${cardID},'${token_number}','${domainName}',"Active")`);
            res.status(200).send({
              isSuccessful: true,
              message: "Token is created successfully",
            });
          }
        } else {
          res.status(400).send({
            isSuccessful: false,
            message: `The user don't have the card to create a token`,
          });
        }
      } else {
        res
          .status(400)
          .send({
            isSuccessful: false,
            message: `No user exists with the ID :: ${id}`,
          });
      }
    } else {
      res.status(400).send({
        isSuccessful: false,
        message: `Mandatory fields should be provided with valid data :: ${mandatoryFieldserrors.join(
          ", "
        )}`,
      });
    }
  } else {
    res.status(400).send({
      isSuccessful: false,
      message: "Request body should not be empty",
    });
  }
});
