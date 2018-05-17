/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for
 * license information.
 */
'use strict';

const msRestAzure = require('ms-rest-azure');
const azureConstants = require('ms-rest-azure/lib/Constants');
const AzureEnvironment = require('ms-rest-azure/lib/AzureEnvironment');
const KeyVault = require('azure-keyvault');
const KeyVaultManagementClient = require('azure-arm-keyvault');
const ResourceManagementClient = require('azure-arm-resource').ResourceManagementClient;
const random_id = require('./random_id');
const adal = require('adal-node');
const request = require('request-promise-native');

// Validate env variables
var envs = [];
if (!process.env['AZURE_SUBSCRIPTION_ID']) envs.push('AZURE_SUBSCRIPTION_ID');
if (!process.env['AZURE_TENANT_ID']) envs.push('AZURE_TENANT_ID');
if (!process.env['AZURE_CLIENT_ID']) envs.push('AZURE_CLIENT_ID');
if (!process.env['AZURE_CLIENT_OID']) envs.push('AZURE_CLIENT_OID');
if (!process.env['AZURE_CLIENT_SECRET']) envs.push('AZURE_CLIENT_SECRET');

if (envs.length > 0) {
    throw new Error(util.format('please set/export the following environment variables: %s', envs.toString()));
}

// Set up our config object
const config = {
    // Service principal details for running the sample.
    subscriptionId: process.env['AZURE_SUBSCRIPTION_ID'],
    tenantId:       process.env['AZURE_TENANT_ID'],
    clientId:       process.env['AZURE_CLIENT_ID'],
    objectId:       process.env['AZURE_CLIENT_OID'],
    secret:         process.env['AZURE_CLIENT_SECRET'],
    azureLocation:  process.env['AZURE_LOCATION'] || 'westus',
    groupName:      process.env['AZURE_RESOURCE_GROUP'] || 'azure-sample-group',
    environment:    AzureEnvironment.Azure,
    tokenCache:     new adal.MemoryCache(),
    storageAccName: "sa" + random_id() // random ID for newly generated storage acc
};


// Create an ADAL authorization context
config.authContext = new adal.AuthenticationContext(
    config.environment.activeDirectoryEndpointUrl + config.tenantId,
    config.environment.validateAuthority, 
    config.tokenCache
);

if(process.env['AZURE_SAMPLE_VAULT_NAME']) {
    config.vaultName = process.env['AZURE_SAMPLE_VAULT_NAME'];
}

async function _getManagementCredentials() {
    // Return service principal credentials based on our config.
    return msRestAzure.loginWithServicePrincipalSecret(config.clientId, config.secret, config.tenantId, { tokenCache: config.tokenCache });
}

function _getKeyVaultUserClient() {
    // Callback for ADAL authentication.
    const adalCallback = (challenge, callback) => {
        _getUserCredentials(challenge.resource, config.clientId).then( (creds) => {
            _tokenFromUserCredentials(creds).then( (tokenResponse) => {
                return callback(null, tokenResponse.tokenType + ' ' + tokenResponse.accessToken);
            });
        });
    };
    
    return new KeyVault.KeyVaultClient(new KeyVault.KeyVaultCredentials(adalCallback));
}

function _getKeyVaultClient() {
    // Callback for ADAL authentication.
    const adalCallback = (challenge, callback) => {
        const context = new adal.AuthenticationContext(challenge.authorization);
        return context.acquireTokenWithClientCredentials(challenge.resource, config.clientId, config.secret, (err, tokenResponse) => {
            if(err) {
                throw err;
            }
            
            // The KeyVaultCredentials callback expects an error, if any, as the first parameter. 
            // It then expects a value for the HTTP 'Authorization' header, which we compute based upon the access token obtained with the SP client credentials. 
            // The token type will generally equal 'Bearer' - in some user-specific situations, a different type of token may be issued. 
            return callback(null, tokenResponse.tokenType + ' ' + tokenResponse.accessToken);
        });
    };
    
    return new KeyVault.KeyVaultClient(new KeyVault.KeyVaultCredentials(adalCallback));
}

async function _getUserCredentials(resource, clientId) {
    clientId = clientId || azureConstants.DEFAULT_ADAL_CLIENT_ID;
    resource = resource || 'https://management.core.windows.net/';
    
    // If we already have a user id, we've already logged in. Try to retrieve the token from the cache.
    if(config._userId) {
        try {
            let token = await new Promise( (resolve, reject) => {
                config.authContext.acquireToken(resource, config._userId, azureConstants.DEFAULT_ADAL_CLIENT_ID, function(err, response) {
                    if(err) {
                        reject(err);
                    }
                    
                    resolve(response);
                });
            });
            
            return new msRestAzure.DeviceTokenCredentials({
                tokenAudience: token.resource,
                domain: config.tenantId,
                tokenCache: config.tokenCache,
                username: token.userId
            });
        } catch(e) {
            console.log(e);
            // fall-through and try interactive login
        }
    }
    
    // Otherwise, interactive login.
    const interactiveLoginOptions = {
        tokenAudience: resource,
        domain: config.tenantId,
        tokenCache: config.tokenCache
    };
    
    const creds = await msRestAzure.interactiveLogin(interactiveLoginOptions);
    config._userId = creds.username; // store the username so we can access cached tokens
    
    return creds;
}

async function _tokenFromUserCredentials(creds) {
    return new Promise( (resolve, reject) => {
        creds.getToken( (err, token) => {
            if(err) {
                reject(err);
                return;
            }
            resolve(token);
        });
    });
}

async function _getSampleVault() {
    // If we already have a sample vault set up, return it.
    if(config.vault) {
        return config.vault;
    }
    
    const credentials        = await _getManagementCredentials();
    const kvManagementClient = new KeyVaultManagementClient(credentials, config.subscriptionId);
    const resourceClient     = new ResourceManagementClient(credentials, config.subscriptionId);
    
    // If we have specified a sample vault name, use that instead of creating a new one.
    if(config.vaultName) {
        config.vault = await kvManagementClient.vaults.get(config.groupName, config.vaultName);
        return config.vault;
    }
    
    // Ensure we have the sample resource group created.
    await resourceClient.resourceGroups.createOrUpdate(config.groupName, { location: config.azureLocation });
    
    // Set up the parameters for key vault creation.
    const kvParams = {
        location: config.azureLocation,
        properties: {
            sku: { 
                name: 'standard'
            },
            accessPolicies: [
                {
                    tenantId: config.tenantId,
                    objectId: config.objectId,
                    permissions: {
                        secrets: ['all'],
                        storage: ['all'],
                        keys: ['all'],
                        certificates: ['all']
                    }
                }
            ],
            enabledForDeployment: false,
            tenantId: config.tenantId
        },
        tags: {}
    };
    
    const kvName = random_id();
    console.log("Creating sample key vault: " + kvName);
    
    // Create the sample key vault using the KV management client and return it.
    config.vault = await kvManagementClient.vaults.createOrUpdate(config.groupName, kvName, kvParams);
    return config.vault;
}

// Export for consumption by sample
module.exports = {
    config: config,
    getSampleVault: _getSampleVault,
    getUserCredentials: _getUserCredentials,
    getManagementCredentials: _getManagementCredentials,
    getTokenFromUserCreds: _tokenFromUserCredentials,
    getKeyVaultUserClient: _getKeyVaultUserClient,
    getKeyVaultSpClient: _getKeyVaultClient,
};

