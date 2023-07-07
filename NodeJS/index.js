const express = require("express");
const dbo = require("./db/db");
const app = express();
var cors = require('cors');
app.use(cors());
const bodyParser = require('body-parser');
const port = 4444;
const jsonParser = bodyParser.json();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
app.use(bodyParser.json());


dbo.connectToServer();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '../static/media/versions');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } }).single('file');


app.get("/", function (req, res) {
  res.send("Hello World!");
});

app.listen(port, function () {
  console.log(`App listening on port ${port}!`);
});

app.get("/account/list", function (req, res) {
    const dbConnect = dbo.getDb();
    dbConnect
      .collection("account")
      .find({})
      .toArray(function (err, result) {
        if (err) {
          res.status(400).send("Error fetching accounts!");
        } else {
          res.json(result);
        }
      });
});

app.get('/account/admin/:mail', function (req, res) {
  const { mail } = req.params;
  const dbConnect = dbo.getDb();

  dbConnect.collection('account').findOne({ mail }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching account!');
    } else {
      if (result) {
        res.json({ isAdmin: result.admin });
      } else {
        res.status(400).send('Account not found!');
      }
    }
  });
});

app.get('/account/admin/get/all', (req, res) => {
  const dbConnect = dbo.getDb();

  dbConnect.collection('account').find().toArray((err, accounts) => {
    if (err) {
      console.error('Error fetching user accounts:', err);
      return res.status(500).json({ error: 'An error occurred while fetching user accounts' });
    }

    const userAccounts = accounts.map((account) => ({ mail: account.mail, admin: account.admin }));

    res.json({ accounts: userAccounts });
  });
});

app.post('/account/login', jsonParser, function (req, res) {
  const { mail, password } = req.body;
  const dbConnect = dbo.getDb();
  dbConnect.collection('account').findOne({ mail }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching account!');
    } else {
      if (result) {
        // Compare the entered password with the stored hashed password
        bcrypt.compare(password, result.password, function (err, passwordMatch) {
          if (passwordMatch) {
            res.json({ success: true, message: 'Login successful!' });
          } else {
            res.json({ success: false, message: 'Invalid email or password!' });
          }
        });
      } else {
        res.json({ success: false, message: 'Invalid email or password!' });
      }
    }
  });
});

app.post('/account/insert', jsonParser, async (req, res) => {
  const body = req.body;
  const dbConnect = dbo.getDb();

  // Check if email or password is missing
  if (!body.mail || !body.password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cryptage = 10;
  const hashedPassword = await bcrypt.hash(body.password, cryptage);

  const newAccount = {
    mail: body.mail,
    password: hashedPassword,
    admin: false,
    resetToken: null,
    resetTokenExpires: null,
    createdAt: new Date(),
  };

  dbConnect.collection('account').insertOne(newAccount);
  res.json(newAccount);
});

app.put('/account/update/password', jsonParser, async (req, res) => {
    const body = req.body;
    const dbConnect = dbo.getDb();
    console.log('Got body:', body);

    const previousPassword = body.previousPassword;
    const newPassword = body.newPassword;

    dbConnect.collection('account').findOne({ mail: body.mail }, (err, result) => {
        if(err) {
            res.status(400).send("Error fetching account!");
        } else {
            if(result) {
                bcrypt.compare(previousPassword, result.password, (err, isMatch) => {
                  if(err) {
                    res.status(400).send("Error comparing passwords!");
                  } else {
                    if(isMatch) {
                        bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
                            if(err) {
                                res.status(400).send("Error hashing new password!");
                            } else {
                                dbConnect.collection('account').updateOne(
                                    { mail: body.mail },
                                    { $set: { password: hashedPassword } },
                                    (err, result) => {
                                        if(err) {
                                            res.status(400).send("Error updating password!");
                                        } else {
                                            res.json({ message: "Password updated successfully" });
                                        }
                                    }
                                );
                            }
                        });
                    } else {
                        res.status(400).send("Incorrect previous password!");
                    }
                  }
                });
            } else {
                res.status(400).send("No account found with the provided email!");
            }
        }
    });
});

app.put('/account/update/admin', jsonParser, (req, res) => {
    const { mail, admin } = req.body;
    const dbConnect = dbo.getDb();
  
    dbConnect.collection('account').updateOne(
      { mail: mail },
      { $set: { admin: admin } },
      (err, result) => {
        if (err) {
          res.status(400).send('Error updating admin status!');
        } else {
          res.status(200).send('Admin status updated successfully!');
        }
      }
    );
});

app.delete('/account/delete', jsonParser, async (req, res) => {
  const mail = req.body.mail;
  const dbConnect = dbo.getDb();

  try {
    const result = await dbConnect.collection('account').deleteOne({ mail: mail });
    
    if (result.deletedCount === 1) {
      res.json({ message: "Account deleted successfully" });
    } else {
      res.status(400).send("No account found with the provided email");
    }
  } catch (error) {
    res.status(500).send("Error deleting account: " + error.message);
  }
});

app.get('/account/recent', async (req, res) => {
  const dbConnect = dbo.getDb();

  try {
    // Retrieve the recent users from the database
    const recentUsers = await dbConnect.collection('account')
      .find()
      .sort({ createdAt: -1 }) // Sort by creation timestamp in descending order
      .limit(5)
      .toArray();

    // Return the limited recent users as the response
    res.json({ users: recentUsers });
  } catch (error) {
    console.error('Error fetching recent users:', error);
    res.status(500).json({ error: 'An error occurred while fetching recent users' });
  }
});

app.get('/versions', function (req, res) {
  const dbConnect = dbo.getDb();

  dbConnect.collection('versions').find({}, { projection: { _id: 0, version: 1 } }).toArray(function (err, result) {
    if (err) {
      res.status(400).send('Error fetching versions!');
    } else {
      const versions = result.map((item) => item.version);
      res.json({ versions });
    }
  });
});


app.get('/versions/date/:version', function (req, res) {
  const { version } = req.params;
  const dbConnect = dbo.getDb();

  dbConnect.collection('versions').findOne({ version }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching version!');
    } else {
      if (result) {
        res.json({ date: result.date });
      } else {
        res.status(400).send('Version not found!');
      }
    }
  });
});

app.post('/versions/update/:version', (req, res) => {
  const versionNumber = req.params.version;
  const body = req.body;
  console.log('Got body:', body);


  if (body.newImage !== null && body.newImage !== body.image) {
    const filePath = `../static/media/versions/${body.image}`;
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
      } else {
        console.log('File deleted successfully');
      }
    });
  }

  body.newChangelog = body.newChangelog === '' ? body.changelog : body.newChangelog;
  body.newDev = body.newDev === '' ? body.dev : body.newDev;
  body.newImage = body.newImage === null ? body.image : body.newImage;

  console.log('Last Body:', body);

  const dbConnect = dbo.getDb();
  dbConnect.collection("versions").findOne({ version: versionNumber.toString() }, (err, version) => {
    if (err) {
      console.error('Error finding version:', err);
      res.sendStatus(500);
      return;
    }

    if (!version) {
      console.error('Version not found');
      res.sendStatus(404);
      return;
    }

    dbConnect.collection("versions").updateOne(
      { version: versionNumber },
      {
        $set: {
          changelog: body.newChangelog,
          dev: body.newDev,
          image: body.newImage,
        },
      },
      (err) => {
        if (err) {
          console.error('Error updating version:', err);
          res.sendStatus(500);
          return;
        }

        res.json(body);
      }
    );
  });
});

app.post("/versions/insert", jsonParser, (req, res) => {
  const { changelog, dev, image } = req.body;
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const versionDate = year + "-" + month + "-" + day;
  const dbConnect = dbo.getDb();

  const versionData = {
    version: "",
    changelog: changelog,
    dev: dev,
    date: versionDate,
    image: image,
  };

  dbConnect.collection("versions").insertOne(versionData, (err, result) => {
    if (err) {
      res.status(400).send("Error inserting version data!");
    } else {
      // Fetch the next version number
      axios.get("http://localhost:4444/versions/increase")
        .then((response) => {
          const nextVersion = response.data.version;
          // Update the inserted version with the next version number
          dbConnect.collection("versions").updateOne(
            { _id: result.insertedId },
            { $set: { version: nextVersion } },
            (err) => {
              if (err) {
                res.status(400).send("Error updating version number!");
              } else {
                res.status(200).send("Version data inserted successfully!");
              }
            }
          );
        })
        .catch((error) => {
          res.status(500).send("Error fetching next version number!");
        });
    }
  });
});

app.get("/versions/increase", (req, res) => {
  const dbConnect = dbo.getDb();

  dbConnect
    .collection("versions")
    .find()
    .sort({ version: -1 })
    .limit(1)
    .toArray((err, result) => {
      if (err) {
        res.status(400).send("Error fetching latest version!");
      } else {
        let latestVersion = result.length > 0 ? result[0].version : "0";
        let nextVersion = (parseInt(latestVersion) || 0) + 1;
        res.json({ version: nextVersion.toString() });
      }
    });
});

app.get('/versions/changelog/:version', function (req, res) {
  const { version } = req.params;
  const dbConnect = dbo.getDb();

  dbConnect.collection('versions').findOne({ version }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching version!');
    } else {
      if (result) {
        res.json({ changelog: result.changelog });
      } else {
        res.status(400).send('Version not found!');
      }
    }
  });
});

app.get('/versions/developer/:version', function (req, res) {
  const { version } = req.params;
  const dbConnect = dbo.getDb();

  dbConnect.collection('versions').findOne({ version }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching version!');
    } else {
      if (result) {
        res.json({ dev: result.dev });
      } else {
        res.status(400).send('Version not found!');
      }
    }
  });
});

app.get('/versions/image/:version', function (req, res) {
  const { version } = req.params;
  const dbConnect = dbo.getDb();

  dbConnect.collection('versions').findOne({ version }, function (err, result) {
    if (err) {
      res.status(400).send('Error fetching version!');
    } else {
      if (result) {
        res.json({ image: result.image });
      } else {
        res.status(400).send('Version not found!');
      }
    }
  });
});

app.get('/versions/latest', (req, res) => {
  const dbConnect = dbo.getDb(); // Get your database connection
  
  dbConnect.collection('versions')
    .find()
    .sort({ version: -1 })
    .limit(1)
    .toArray((err, versions) => {
      if (err) {
        console.error('Error retrieving latest version:', err);
        res.sendStatus(500);
        return;
      }

      if (versions.length === 0) {
        console.error('No versions found');
        res.sendStatus(404);
        return;
      }

      const latestVersion = versions[0].version;
      res.send(latestVersion);
    });
});

app.post('/version/delete', async (req, res) => {
  const version = req.body.version;
  const dbConnect = dbo.getDb();

  try {
    const result = await dbConnect.collection('versions').deleteOne({ version: version });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: `Version ${version} deleted successfully` });
    } else {
      res.status(404).json({ message: `Version ${version} not found` });
    }
  } catch (error) {
    console.error('Error deleting version:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/account/forgot-password', jsonParser, async (req, res) => {
  const { mail } = req.body;
  const dbConnect = dbo.getDb();
  
  try {
    // Generate a unique reset token
    const resetToken = generateResetToken();
    
    // Set the token expiration time (e.g., 1 hour from the current time)
    const resetTokenExpires = new Date(Date.now() + 1 * 60 * 60 * 1000);
    
    // Update the user account with the reset token and expiration time
    const result = await dbConnect.collection('account').updateOne(
      { mail: mail },
      { $set: { resetToken, resetTokenExpires } }
    );
    
    if (result.modifiedCount === 1) {
      // Send the reset token to the user (via email)
      sendResetTokenEmail(mail, resetToken);
      
      res.json({ message: 'Reset token sent successfully' });
    } else {
      res.status(400).send('No account found with the provided email');
    }
  } catch (error) {
    res.status(500).send('Error generating reset token: ' + error.message);
  }
});

function generateResetToken() {
  // Generate a random token
  const tokenLength = 16;
  const token = crypto.randomBytes(tokenLength).toString('hex');
  
  // Return the generated reset token
  return token;
}

function sendResetTokenEmail(mail, resetToken) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: 'noreply.librenberry@gmail.com',
      pass: 'ubpmsjxdmfbaagou',
    },
  });

  const mailOptions = {
    from: 'noreply.librenberry@gmail.com',
    to: mail,
    subject: 'Rénitialisation de votre mot de passe',
    html: `<!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
    
    <head>
      <title></title>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0"><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
      <style>
        * {
          box-sizing: border-box;
        }
    
        body {
          margin: 0;
          padding: 0;
        }
    
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: inherit !important;
        }
    
        #MessageViewBody a {
          color: inherit;
          text-decoration: none;
        }
    
        p {
          line-height: inherit
        }
    
        .desktop_hide,
        .desktop_hide table {
          mso-hide: all;
          display: none;
          max-height: 0px;
          overflow: hidden;
        }
    
        .image_block img+div {
          display: none;
        }
    
        @media (max-width:520px) {
          .desktop_hide table.icons-inner {
            display: inline-block !important;
          }
    
          .icons-inner {
            text-align: center;
          }
    
          .icons-inner td {
            margin: 0 auto;
          }
    
          .row-content {
            width: 100% !important;
          }
    
          .mobile_hide {
            display: none;
          }
    
          .stack .column {
            width: 100%;
            display: block;
          }
    
          .mobile_hide {
            min-height: 0;
            max-height: 0;
            max-width: 0;
            overflow: hidden;
            font-size: 0px;
          }
    
          .desktop_hide,
          .desktop_hide table {
            display: table !important;
            max-height: none !important;
          }
        }
      </style>
    </head>
    
    <body style="background-color: #FFFFFF; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
      <table class="nl-container" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #FFFFFF;">
        <tbody>
          <tr>
            <td>
              <table class="row row-1" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="width:100%;padding-right:0px;padding-left:0px;">
                                    <div class="alignment" align="center" style="line-height:10px"><img src="https://112446620b.imgdist.com/public/users/BeeFree/beefree-b0ogybwnnik/logoLB2.png" style="display: block; height: auto; border: 0; width: 179px; max-width: 100%;" width="179"></div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-2" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="divider_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <div class="alignment" align="center">
                                      <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                        <tr>
                                          <td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #BBBBBB;"><span>&#8202;</span></td>
                                        </tr>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-3" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="heading_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="text-align:center;width:100%;">
                                    <h1 style="margin: 0; color: #555555; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 23px; font-weight: 700; letter-spacing: normal; line-height: 120%; text-align: center; margin-top: 0; margin-bottom: 0;"><span class="tinyMce-placeholder">Réinitialisation de votre mot de passe</span></h1>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-4" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="25%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="icons_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="vertical-align: middle; color: #000000; font-family: inherit; font-size: 14px; font-weight: 400; text-align: center;">
                                    <table class="alignment" cellpadding="0" cellspacing="0" role="presentation" align="center" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                      <tr>
                                        <td style="vertical-align: middle; text-align: center; padding-top: 25px; padding-bottom: 25px; padding-left: 25px; padding-right: 25px;"><img class="icon" src="https://5870ba1df0.imgdist.com/public/users/Integrators/BeeProAgency/1003125_987950/lock.png" height="64" width="64" align="center" style="display: block; height: auto; margin: 0 auto; border: 0;"></td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td class="column column-2" width="75%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#000000;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:14px;font-weight:400;letter-spacing:1px;line-height:180%;text-align:center;mso-line-height-alt:25.2px;">
                                      <p style="margin: 0;"><strong>Afin que vous puissiez réinitialiser votre mot de passe, récupérez le jeton de réinitialisation et finalisez les étapes de réinitialisation.</strong></p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-5" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="50%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="25" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#000000;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:14px;font-weight:400;letter-spacing:0px;line-height:200%;text-align:center;mso-line-height-alt:28px;">
                                      <p style="margin: 0;"><strong><u>Jeton de réinitialisation :</u></strong></p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td class="column column-2" width="50%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="25" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#000000;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:14px;font-weight:400;letter-spacing:0px;line-height:180%;text-align:center;mso-line-height-alt:25.2px;">
                                      <p style="margin: 0;"><span style="color: #fd0000;"><em><strong>${resetToken}</strong></em></span></p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-6" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="divider_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <div class="alignment" align="center">
                                      <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                        <tr>
                                          <td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #BBBBBB;"><span>&#8202;</span></td>
                                        </tr>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-7" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="width:100%;padding-right:0px;padding-left:0px;">
                                    <div class="alignment" align="center" style="line-height:10px"><img src="https://112446620b.imgdist.com/public/users/BeeFree/beefree-b0ogybwnnik/logoPenalityBoxDark.png" style="display: block; height: auto; border: 0; width: 100px; max-width: 100%;" width="100"></div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-8" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="icons_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="vertical-align: middle; color: #9d9d9d; font-family: inherit; font-size: 15px; padding-bottom: 5px; padding-top: 5px; text-align: center;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                      <tr>
                                        <td class="alignment" style="vertical-align: middle; text-align: center;"><!--[if vml]><table align="left" cellpadding="0" cellspacing="0" role="presentation" style="display:inline-block;padding-left:0px;padding-right:0px;mso-table-lspace: 0pt;mso-table-rspace: 0pt;"><![endif]-->
                                          <!--[if !vml]><!-->
                                          <table class="icons-inner" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; display: inline-block; margin-right: -4px; padding-left: 0px; padding-right: 0px;" cellpadding="0" cellspacing="0" role="presentation"><!--<![endif]-->
                                            <tr>
                                              <td style="vertical-align: middle; text-align: center; padding-top: 5px; padding-bottom: 5px; padding-left: 5px; padding-right: 6px;"><a href="https://www.designedwithbee.com/" target="_blank" style="text-decoration: none;"><img class="icon" alt="Designed with BEE" src="https://d15k2d11r6t6rl.cloudfront.net/public/users/Integrators/BeeProAgency/53601_510656/Signature/bee.png" height="32" width="34" align="center" style="display: block; height: auto; margin: 0 auto; border: 0;"></a></td>
                                              <td style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 15px; color: #9d9d9d; vertical-align: middle; letter-spacing: undefined; text-align: center;"><a href="https://www.designedwithbee.com/" target="_blank" style="color: #9d9d9d; text-decoration: none;">Designed with BEE</a></td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table><!-- End -->
    </body>
    
    </html>`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending reset token email:', error);
    } else {
      console.log('Reset token email sent:', info.response);
    }
  });
}


app.post('/account/reset-password', jsonParser, async (req, res) => {
  const { mail, resetToken, newPassword } = req.body;
  const dbConnect = dbo.getDb();

  try {
    // Find the user with the provided email and reset token
    const user = await dbConnect.collection('account').findOne({ mail, resetToken });

    if (!user) {
      return res.status(400).send('Invalid or expired reset token');
    }

    if (!newPassword) {
      return res.status(400).send('New password cannot be empty');
    }

    // Generate a new hashed password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user's password in the database
    const result = await dbConnect.collection('account').updateOne(
      { mail, resetToken },
      { $set: { password: hashedPassword, resetToken: null, resetTokenExpires: null } }
    );

    if (result.modifiedCount === 1) {
      res.json({ success: true, message: 'Password reset successful' });
    } else {
      res.json({ success: false, message: 'Failed to reset password' });
    }
  } catch (error) {
    res.status(500).send('Error resetting password: ' + error.message);
  }
});


app.post('/contact/send', function (req, res) {
  const { firstName, lastName, email, sujet, message } = req.body;

  // Create a Nodemailer transport
  const transporter = nodemailer.createTransport({
    host: 'ssl0.ovh.net',
    port: '465',
    secure: true,
    auth: {
      user: 'contact@librenberry.net',
      pass: 'AccesMailLibreK6p',
    },
  });

  const mailOptions = {
    from: `${email}`,
    to: 'contact@librenberry.net',
    subject: `${sujet}`,
    html: `<!DOCTYPE html>
    <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
    
    <head>
      <title></title>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0"><!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->
      <style>
        * {
          box-sizing: border-box;
        }
    
        body {
          margin: 0;
          padding: 0;
        }
    
        a[x-apple-data-detectors] {
          color: inherit !important;
          text-decoration: inherit !important;
        }
    
        #MessageViewBody a {
          color: inherit;
          text-decoration: none;
        }
    
        p {
          line-height: inherit
        }
    
        .desktop_hide,
        .desktop_hide table {
          mso-hide: all;
          display: none;
          max-height: 0px;
          overflow: hidden;
        }
    
        .image_block img+div {
          display: none;
        }
    
        @media (max-width:520px) {
          .desktop_hide table.icons-inner {
            display: inline-block !important;
          }
    
          .icons-inner {
            text-align: center;
          }
    
          .icons-inner td {
            margin: 0 auto;
          }
    
          .row-content {
            width: 100% !important;
          }
    
          .mobile_hide {
            display: none;
          }
    
          .stack .column {
            width: 100%;
            display: block;
          }
    
          .mobile_hide {
            min-height: 0;
            max-height: 0;
            max-width: 0;
            overflow: hidden;
            font-size: 0px;
          }
    
          .desktop_hide,
          .desktop_hide table {
            display: table !important;
            max-height: none !important;
          }
        }
      </style>
    </head>
    
    <body style="background-color: #FFFFFF; margin: 0; padding: 0; -webkit-text-size-adjust: none; text-size-adjust: none;">
      <table class="nl-container" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; background-color: #FFFFFF;">
        <tbody>
          <tr>
            <td>
              <table class="row row-1" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="width:100%;padding-right:0px;padding-left:0px;">
                                    <div class="alignment" align="center" style="line-height:10px"><img src="https://112446620b.imgdist.com/public/users/BeeFree/beefree-b0ogybwnnik/logoLB2.png" style="display: block; height: auto; border: 0; width: 179px; max-width: 100%;" width="179"></div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-2" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="divider_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <div class="alignment" align="center">
                                      <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                        <tr>
                                          <td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #BBBBBB;"><span>&#8202;</span></td>
                                        </tr>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-3" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="33.333333333333336%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="heading_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <h2 style="margin: 0; color: #8a3c90; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 30px; font-weight: 700; letter-spacing: normal; line-height: 180%; text-align: center; margin-top: 0; margin-bottom: 0;"><span class="tinyMce-placeholder">Nom</span></h2>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td class="column column-2" width="66.66666666666667%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#101112;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:27px;font-weight:400;letter-spacing:0px;line-height:200%;text-align:center;mso-line-height-alt:54px;">
                                      <p style="margin: 0;">${firstName}</p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-4" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="33.333333333333336%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="heading_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <h2 style="margin: 0; color: #8a3c90; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 30px; font-weight: 700; letter-spacing: normal; line-height: 180%; text-align: center; margin-top: 0; margin-bottom: 0;"><span class="tinyMce-placeholder">Prénom</span></h2>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td class="column column-2" width="66.66666666666667%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#101112;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:27px;font-weight:400;letter-spacing:0px;line-height:200%;text-align:center;mso-line-height-alt:54px;">
                                      <p style="margin: 0;">${lastName}</p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-5" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="33.333333333333336%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="heading_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <h2 style="margin: 0; color: #8a3c90; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 30px; font-weight: 700; letter-spacing: normal; line-height: 180%; text-align: center; margin-top: 0; margin-bottom: 0;"><span class="tinyMce-placeholder">E-mail</span></h2>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td class="column column-2" width="66.66666666666667%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#101112;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:27px;font-weight:400;letter-spacing:0px;line-height:200%;text-align:center;mso-line-height-alt:54px;">
                                      <p style="margin: 0;">${email}</p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-6" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="divider_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <div class="alignment" align="center">
                                      <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="80%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                        <tr>
                                          <td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #BBBBBB;"><span>&#8202;</span></td>
                                        </tr>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                              <table class="heading_block block-2" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="text-align:center;width:100%;">
                                    <h1 style="margin: 0; color: #555555; direction: ltr; font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 23px; font-weight: 700; letter-spacing: normal; line-height: 120%; text-align: center; margin-top: 0; margin-bottom: 0;"><span class="tinyMce-placeholder">${sujet}</span></h1>
                                  </td>
                                </tr>
                              </table>
                              <table class="divider_block block-3" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad">
                                    <div class="alignment" align="center">
                                      <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="80%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                        <tr>
                                          <td class="divider_inner" style="font-size: 1px; line-height: 1px; border-top: 1px solid #BBBBBB;"><span>&#8202;</span></td>
                                        </tr>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-7" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="paragraph_block block-1" width="100%" border="0" cellpadding="10" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; word-break: break-word;">
                                <tr>
                                  <td class="pad">
                                    <div style="color:#101112;direction:ltr;font-family:Arial, 'Helvetica Neue', Helvetica, sans-serif;font-size:16px;font-weight:400;letter-spacing:0px;line-height:120%;text-align:left;mso-line-height-alt:19.2px;">
                                      <p style="margin: 0;">${message.replace(/\n/g, '<br>')}</p>
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-8" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-radius: 0; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="image_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="width:100%;padding-right:0px;padding-left:0px;">
                                    <div class="alignment" align="center" style="line-height:10px"><img src="https://112446620b.imgdist.com/public/users/BeeFree/beefree-b0ogybwnnik/logoPenalityBoxDark.png" style="display: block; height: auto; border: 0; width: 100px; max-width: 100%;" width="100"></div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
              <table class="row row-9" align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                <tbody>
                  <tr>
                    <td>
                      <table class="row-content stack" align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; color: #000000; width: 500px;" width="500">
                        <tbody>
                          <tr>
                            <td class="column column-1" width="100%" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; font-weight: 400; text-align: left; padding-bottom: 5px; padding-top: 5px; vertical-align: top; border-top: 0px; border-right: 0px; border-bottom: 0px; border-left: 0px;">
                              <table class="icons_block block-1" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                <tr>
                                  <td class="pad" style="vertical-align: middle; color: #9d9d9d; font-family: inherit; font-size: 15px; padding-bottom: 5px; padding-top: 5px; text-align: center;">
                                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt;">
                                      <tr>
                                        <td class="alignment" style="vertical-align: middle; text-align: center;"><!--[if vml]><table align="left" cellpadding="0" cellspacing="0" role="presentation" style="display:inline-block;padding-left:0px;padding-right:0px;mso-table-lspace: 0pt;mso-table-rspace: 0pt;"><![endif]-->
                                          <!--[if !vml]><!-->
                                          <table class="icons-inner" style="mso-table-lspace: 0pt; mso-table-rspace: 0pt; display: inline-block; margin-right: -4px; padding-left: 0px; padding-right: 0px;" cellpadding="0" cellspacing="0" role="presentation"><!--<![endif]-->
                                            <tr>
                                              <td style="vertical-align: middle; text-align: center; padding-top: 5px; padding-bottom: 5px; padding-left: 5px; padding-right: 6px;"><a href="https://www.designedwithbee.com/" target="_blank" style="text-decoration: none;"><img class="icon" alt="Designed with BEE" src="https://d15k2d11r6t6rl.cloudfront.net/public/users/Integrators/BeeProAgency/53601_510656/Signature/bee.png" height="32" width="34" align="center" style="display: block; height: auto; margin: 0 auto; border: 0;"></a></td>
                                              <td style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; font-size: 15px; color: #9d9d9d; vertical-align: middle; letter-spacing: undefined; text-align: center;"><a href="https://www.designedwithbee.com/" target="_blank" style="color: #9d9d9d; text-decoration: none;">Designed with BEE</a></td>
                                            </tr>
                                          </table>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table><!-- End -->
    </body>
    
    </html>`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email', error);
      res.status(500).json({ message: 'An error occurred while sending the email' });
    } else {
      console.log('Email sent successfully');
      res.status(200).json({ message: 'Contact form submitted successfully' });
    }
  });
});



app.post('/upload', function (req, res, next) {
  upload(req, res, function (err) { // Updated here
    if (err) {
      return res.status(500).json({ error: err });
    }
    if (req.file && req.file.filename) {
      return res.status(200).json({ message: 'File uploaded successfully', filename: req.file.filename });
    } else {
      return res.status(500).json({ message: 'Error uploading file' });
    }
  });
});