/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for
 * license information.
 */
'use strict';

const util = require('util');
const msRestAzure = require('ms-rest-azure');
const KeyVault = require('azure-keyvault');
const AuthenticationContext = require('adal-node').AuthenticationContext;
const AzureStorage = require('azure-storage');
const KeyVaultManagementClient = require('azure-arm-keyvault');
const StorageManagementClient = require('azure-arm-storage');
const AuthorizationManagementClient = require('azure-arm-authorization');
const uuidv4 = require('uuid/v4');
const SampleUtil = require('./sample_util');
const random_id = require('./random_id');

// Creates a storage account and then adds it to the sample key vault to manage its keys.
async function addStorageAccount(vault) { 
    /*
     Only user accounts with access to a storage account's keys can add a storage account to a vault.
     Thus, the sample creates the storage account with a user account authenticated through device login, rather than service principal credentials as in other samples.
    */
    
    // Create a storage management client w/ user credentials
    const userCreds = await SampleUtil.getUserCredentials();

    const storageMgmtClient = new StorageManagementClient(userCreds, SampleUtil.config.subscriptionId);
    const authorizationMgmtClient = new AuthorizationManagementClient(userCreds, SampleUtil.config.subscriptionId);
    
    console.log("Creating storage account: " + SampleUtil.config.storageAccName);
    const createParams = {
        location: SampleUtil.config.azureLocation,
        sku: {
            name: 'Standard_RAGRS'
        },
        kind: 'Storage',
        tags: {}
    };
    
    
    const storageAccount = await storageMgmtClient.storageAccounts.create(SampleUtil.config.groupName, SampleUtil.config.storageAccName, createParams);
    
    // Find the ID for the "Storage Account Key Operator Service Role" role
    const roleList = await authorizationMgmtClient.roleDefinitions.list('/', { 
        'filter': "roleName eq 'Storage Account Key Operator Service Role'"
    });
    const roleAssignmentParams = {
        roleDefinitionId: roleList[0].id,
        principalId: '93c27d83-f79b-4cb2-8dd4-4aa716542e74' // The Azure Key Vault Service ID
    };
    const roleAssignmentName = uuidv4(); // UUID for the name of the role assignment
    
    try {
        await authorizationMgmtClient.roleAssignments.create(storageAccount.id, roleAssignmentName, roleAssignmentParams);
        console.log('Granted role "Storage Account Key Operator Service Role" to Key Vault on storage account');
    } catch(e) {
        if(e.code != 'RoleAssignmentExists') {
            throw e;
        }
    }
        
    // We now can grant the user access to the vault using an AKV management client with service principal credentials.
    const kvManagementClient = new KeyVaultManagementClient(await SampleUtil.getManagementCredentials(), SampleUtil.config.subscriptionId);
    const userToken = await SampleUtil.getTokenFromUserCreds(userCreds);
    
    // An access policy entry allowing the user access to all permissions on the vault
    const accessPolicyEntry = {
        tenantId: SampleUtil.config.tenantId,
        objectId: userToken.oid,
        permissions: {
            secrets: ['all'],
            storage: ['all'],
            keys: ['all'],
            certificates: ['all']
        }
    };
    vault.properties.accessPolicies.push(accessPolicyEntry);
    
    await kvManagementClient.vaults.createOrUpdate(SampleUtil.config.groupName, vault.name, vault);
    
    console.log("Granted user access to vault.");

    // Use a KeyVaultClient which authenticates with user credentials to  call set storage account against the vault
    // We must do this because the storage account methods in the Key Vault API may not be called by a service principal, only by an authenticated user.
    const akvUserClient = SampleUtil.getKeyVaultUserClient();
    await akvUserClient.setStorageAccount(vault.properties.vaultUri, storageAccount.name, storageAccount.id, 'key1', true, {
        regenerationPeriod : 'P30D',
        storageAccountAttributes: {
            enabled: true
        }
    });
    
    console.log("Added storage account to vault.");
    return storageAccount;
}

async function updateStorageAccount(storageAccount, vault) {
    // Create an AKV client using our service principal credentials
    const kvClient = SampleUtil.getKeyVaultSpClient();

    console.log("Updating storage account active key");
    
    // Update the storage account, changing the active key name
    await kvClient.updateStorageAccount(vault.properties.vaultUri, storageAccount.name, { 
        activeKeyName: 'key2' 
    });
    
    console.log("Disabling automatic key regeneration");
    await kvClient.updateStorageAccount(vault.properties.vaultUri, storageAccount.name, {
        autoRegenerateKey: false
    });
}

async function regenerateStorageAccountKey(storageAccount, vault) {
    // As in add storage account, we must use a user authenticated to AKV, rather than a service principal, to call the regenerate storage account key method
    console.log("Regenerating storage account key1");
    await SampleUtil.getKeyVaultUserClient().regenerateStorageAccountKey(vault.properties.vaultUri, storageAccount.name, 'key1');
}

async function getStorageAccounts(vault) {
    // Create an AKV client using our service principal credentials
    const result = await SampleUtil.getKeyVaultSpClient().getStorageAccounts(vault.properties.vaultUri);
    
    console.log("");
    console.log("Listing storage accounts");
    // List out the accounts
    result.forEach( (account) => {
        console.log("Storage account: '" + account.resourceId + "'");
    });
    console.log("");
}

async function createAccountSASDefinition(storageAccount, vault) {
    const kvClient = SampleUtil.getKeyVaultSpClient();
    
    const policy = {
        AccessPolicy: {
            Services: 'bfqt', // All services: blob, file, queue, and table
            ResourceTypes: 'sco', // All resource types (service, template, object)
            Permissions: 'acdlpruw', // All permissions: add, create, list, process, read, update, write
            Expiry: '2020-01-01' // Expiry will be ignored and validity period will determine token expiry
        }
    };
    
    const sasTemplate = AzureStorage.generateAccountSharedAccessSignature(storageAccount.name, '00000000', policy); // Instead of providing the actual key, just use '00000000' as a placeholder
    
    // Now, set the SAS definition in AKV
    const sasDef = await kvClient.setSasDefinition(vault.properties.vaultUri, storageAccount.name, 'acctall', sasTemplate, 'account', 'PT2H' /* 2 hour validity period */, {
        sasDefinitionAttributes: { enabled: true }
    });
    
    
    // When the SAS definition is created, a corresponding managed secret is also created in the vault. 
    // This secret is used to provision SAS tokens according to the definition. As shown below, we can retrieve a token via the getSecret method.
    const secretId = KeyVault.parseSecretIdentifier(sasDef.secretId);
    const accountSasToken = await kvClient.getSecret(secretId.vault, secretId.name, ''); // managed SAS secrets have no version
    const blobService = AzureStorage.createBlobServiceWithSas(storageAccount.name + "." + AzureStorage.Constants.StorageServiceClientConstants.CLOUD_BLOB_HOST, accountSasToken.value);
    
    return new Promise( (resolve, reject) => {
        blobService.createContainerIfNotExists('sample-container', (err) => {
            if(err) {
                reject(err);
                return;
            }
            blobService.createBlockBlobFromText('sample-container', 'blob1', 'test data', (err) => {
                if(err) {
                    reject(err);
                    return;
                }
                
                console.log("Created sample blob using account SAS definition.");
                resolve();
            });
        });
    });
}

async function createBlobSASDefinition(storageAccount, vault) {
    const kvClient = SampleUtil.getKeyVaultSpClient();
    const tmpBlobService = AzureStorage.createBlobService(storageAccount.name, '00000000');
    
    const token = tmpBlobService.generateSharedAccessSignature('sample-container', null, {
        AccessPolicy: {
            Permissions: 'racwdl', // all permissions on container
        }
    });
    
    const sasTemplate = tmpBlobService.getUrl('sample-container', null, token);
    // Now, set the SAS definition in AKV
    const sasDef = await kvClient.setSasDefinition(vault.properties.vaultUri, storageAccount.name, 'blobcontall', sasTemplate, 'service', 'PT2H' /* 2 hour validity period */, {
        sasDefinitionAttributes: { enabled: true }
    });
    
    const secretId = KeyVault.parseSecretIdentifier(sasDef.secretId);
    const containerToken = await kvClient.getSecret(secretId.vault, secretId.name, ''); // managed SAS secrets have no version
    const blobService = AzureStorage.createBlobServiceWithSas(storageAccount.name + "." + AzureStorage.Constants.StorageServiceClientConstants.CLOUD_BLOB_HOST, containerToken.value);
    
    return new Promise( (resolve, reject) => {
        blobService.createBlockBlobFromText('sample-container', 'blob1', 'test data', (err) => {
            if(err) {
                reject(err);
                return;
            }
            
            console.log("Created sample blob using container SAS definition.");
            resolve();
        });
    });
}

async function getSASDefinitions(storageAccount, vault) {
    const result = await SampleUtil.getKeyVaultSpClient().getSasDefinitions(vault.properties.vaultUri, storageAccount.name);
    
    console.log("");
    console.log("Listing SAS definitions");
    result.forEach( (def) => {
        console.log("SAS def id: " + def.id);
    });
    console.log();
}

async function deleteStorageAccount(vault, storageAccount) {
    await SampleUtil.getKeyVaultSpClient().deleteStorageAccount(vault.properties.vaultUri, storageAccount.name);
    console.log("The storage account has been removed from the vault");
}


async function main() {
    console.log('Azure Key Vault - Managed Storage Account Key Sample');
    
    // Get our sample vault
    const vault = await SampleUtil.getSampleVault();
    
    // Create and add a storage account to our sample vault
    const storageAccount = await addStorageAccount(vault);
    
    // Demonstrate updating properties of the managed storage account
    await updateStorageAccount(storageAccount, vault);
    
    // Demonstrate regeneration of a storage account key
    await regenerateStorageAccountKey(storageAccount, vault);
    
    // Demonstrate listing off the storage accounts in the vault
    await getStorageAccounts(vault);
    
    // Demonstrate the creation of an account-level SAS definition 
    await createAccountSASDefinition(storageAccount, vault);
    
    // Demonstrate the creation of a container-level SAS definition
    await createBlobSASDefinition(storageAccount, vault);
    
    // List all SAS definitions in the account
    await getSASDefinitions(storageAccount, vault);
    
    // Finally, remove the storage account from the vault
    await deleteStorageAccount(vault, storageAccount);
}

main().then( () => { console.log("Sample execution complete."); } );

