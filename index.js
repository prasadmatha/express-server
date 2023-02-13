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
  tokenInfo: ["email", "domainName"],
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
  let dbResponse = await db.get(
    `select * from user inner join card on user.id = card.user_id where user.email= '${body.email}'`
  );
  if (dbResponse != undefined) {
    let dbPassword = bcrypt.compare(body.password, dbResponse.password);
    if (dbPassword) {
      res.status(200).send({
        isSuccessful: true,
        message: "Received user details successfully",
        response: [dbResponse],
      });
    } else {
      res.status(400).send({ isSuccessful: false, message: "Worng Password" });
    }
  } else {
    dbResponse = await db.get(
      `select * from user where email = '${body.email}'`
    );
    if (dbResponse != undefined) {
      let dbPassword = bcrypt.compare(body.password, dbResponse.password);
      if (dbPassword) {
        res.status(200).send({
          isSuccessful: true,
          message: "Received user details successfully",
          response: [dbResponse],
        });
      } else {
        res
          .status(400)
          .send({ isSuccessful: false, message: "Worng Password" });
      }
    } else {
      res.status(400).send({ isSuccessful: false, message: "Wrong password" });
    }
  }
});

app.get("/users", async (req, res) => {
  let dbResponse = await getData("user");
  res.send(dbResponse);
});

app.post("/user/:id/tokens", (req, res) => {});

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
          let isUserHasCard = cardsData.filter((card) => card.user_id == id);
          isUserHasCard = isUserHasCard.length ? true : false;
          if (!isUserHasCard) {
            let isDuplicateCard = cardsData.filter(
              (card) => card.card_number == cardNumber
            );
            isDuplicateCard = isDuplicateCard.length ? true : false;
            if (!isDuplicateCard) {
              let cardID = cardsData[cardsData.length - 1].id + 1;
              let query = `insert into card(id,user_id,name_on_card,card_number,exp_date,cvv) values(
            ${cardID},${id},'${nameOnCard}','${cardNumber}','${expDate}','${cvv}'
          )`;
              let dbResponse = await db.run(query);
              res.send({
                isSuccessful: true,
                message: `Card details are saved successfully`,
              });
            } else {
              res.status(400).send({
                isSuccessful: false,
                message: "Duplicate card number",
              });
            }
          } else {
            res.status(400).send({
              isSuccessful: false,
              message: `The user has one card already`,
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
app.post("/create/token", async (req, res) => {
  let body = req.body;
  let { email, domainName } = body;
  let isObjectNull = Object.keys(body).length == 0 ? true : false;
  let mandatoryFieldserrors = !isObjectNull
    ? checkForMandatoryFields({ tokenInfo: { ...body } })
    : "";
  if (!isObjectNull) {
    if (!mandatoryFieldserrors.length) {
      let user = await db.get(`select * from user where email = '${email}'`);
      if (user != undefined) {
        let { id } = user;
        console.log("userid", id);
        let query = `select * from card where user_id = ${id}`;
        let cardFound = await db.get(query);
        console.log(cardFound);
        if (cardFound != undefined) {
          let tokensData = await getData("token");
          let card_id = cardFound.id;
          if (tokensData.length) {
            let cardTokensData = await db.all(
              `select * from token where card_id = ${card_id}`
            );
            if (cardTokensData.length) {
              let isDomainExists = cardTokensData.filter(
                (token) => token.domain_name == body.domainName
              );
              isDomainExists = isDomainExists.length ? true : false;
              if (!isDomainExists) {
                let tokenID = tokensData[tokensData.length - 1].id + 1;
                let token_number =
                  Math.random().toFixed(13).split(".")[1] +
                  tokenID +
                  id +
                  card_id;
                let query = `insert into token(id,card_id,token_number,domain_name,status)
              values(${tokenID}, ${card_id},'${token_number}','${domainName}',"Active")`;
                let dbResponse = await db.run(query);
                res.status(200).send({
                  isSuccessful: true,
                  message: `Token is created successfully`,
                });
              } else {
                res.status(400).send({
                  isSuccessful: false,
                  message: "Active token already exists for this domain",
                });
              }
            } else {
              let tokenID = tokensData[tokensData.length - 1].id + 1;
              let token_number =
                Math.random().toFixed(13).split(".")[1] +
                tokenID +
                id +
                card_id;
              let query = `insert into token(id,card_id,token_number,domain_name,status)
              values(${tokenID}, ${card_id},'${token_number}','${domainName}',"Active")`;
              let dbResponse = await db.run(query);
              res.status(200).send({
                isSuccessful: true,
                message: `Token is created successfully`,
              });
            }
          } else {
            let token_number =
              Math.random().toFixed(13).split(".")[1] + 1 + id + card_id;
            let query = `insert into token(id,card_id,token_number,domain_name,status)
          values(1, ${card_id},'${token_number}','${domainName}',"Active")`;
            let dbResponse = await db.run(query);
            res.status(200).send({
              isSuccessful: true,
              message: `Token is created successfully`,
            });
          }
        } else {
          res.status(400).send({
            isSuccessful: false,
            message: `The user don't have any card to create a token`,
          });
        }
      } else {
        res
          .status(400)
          .send({ isSuccessful: false, message: `Email ID is not registered` });
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
