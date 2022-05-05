/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for
 * license information.
 */
'use strict';

const util = require('util');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const { ResourceManagementClient } = require('@azure/arm-resources');
const random_id = require('./random_id');
const adal = require('adal-node');
const { ClientSecretCredential } = require('@azure/identity');
// const request = require('request-promise-native');

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
    tokenCache:     new adal.MemoryCache(),
    storageAccName: "sa" + random_id() // random ID for newly generated storage acc
};

if(process.env['AZURE_SAMPLE_VAULT_NAME']) {
    config.vaultName = process.env['AZURE_SAMPLE_VAULT_NAME'];
}

function _getManagementCredentials() {
    // Return service principal credentials based on our config.
    return new ClientSecretCredential(config.tenantId,config.clientId,config.secret)
}


async function _getSampleVault() {
    // If we already have a sample vault set up, return it.
    if(config.vault) {
        return config.vault;
    }
    
    const credentials        = _getManagementCredentials();
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
                family:'A',
                name: 'standard'
            },
            accessPolicies: [
                {
                    tenantId: config.tenantId,
                    objectId: config.objectId,
                    permissions: {
                        keys:['all'],
                        secrets: ['get', 'list', 'set', 'delete', 'backup', 'restore', 'recover', 'purge'],
                        storage: ['get', 'list', 'delete', 'set', 'update', 'regeneratekey', 'recover', 'purge', 'backup', 'restore', 'setsas', 'listsas', 'getsas', 'deletesas']
                    }
                }
            ],
            enabledForDeployment: false,
            tenantId: config.tenantId,
            enableSoftDelete: true,
            enablePurgeProtection: true
        },
        tags: {}
    };
    
    const kvName = random_id();
    console.log("Creating sample key vault: " + kvName);
    
    // Create the sample key vault using the KV management client and return it.
    config.vault = await kvManagementClient.vaults.beginCreateOrUpdateAndWait(config.groupName, kvName, kvParams);
    return config.vault;
}

// Export for consumption by sample
module.exports = {
    config: config,
    getSampleVault: _getSampleVault,
    getManagementCredentials: _getManagementCredentials,
};

