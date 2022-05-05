/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for
 * license information.
 */
'use strict';

const SampleUtil = require('./sample_util');
const { StorageManagementClient } = require('@azure/arm-storage');
const { KeyClient } = require("@azure/keyvault-keys");
const { BlobServiceClient } = require("@azure/storage-blob");
const { AuthorizationManagementClient } = require('@azure/arm-authorization');
const { KeyVaultManagementClient } = require('@azure/arm-keyvault');
const uuidv4 = require('uuid/v4');

// Create a storage management client credentials
const credential = SampleUtil.getManagementCredentials();

const storageMgmtClient = new StorageManagementClient(credential, SampleUtil.config.subscriptionId);
const authorizationMgmtClient = new AuthorizationManagementClient(credential, SampleUtil.config.subscriptionId);

async function addStorageAccount(vault) {
    console.log("Creating storage account: " + SampleUtil.config.storageAccName);
    const createParams = {
        location: SampleUtil.config.azureLocation,
        sku: {
            name: 'Standard_RAGRS'
        },
        kind: 'StorageV2',
        identity: {
            type: "SystemAssigned"
        },
        tags: {}
        
    };
    
    
    const storageAccount = await storageMgmtClient.storageAccounts.beginCreateAndWait(SampleUtil.config.groupName, SampleUtil.config.storageAccName, createParams);

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
    const kvManagementClient = new KeyVaultManagementClient(SampleUtil.getManagementCredentials(), SampleUtil.config.subscriptionId);
    
    // An access policy entry allowing the user access to all storage/secret permissions on the vault
    const accessPolicyEntry = {
        tenantId: SampleUtil.config.tenantId,
        objectId: storageAccount.identity.principalId,
        permissions: {
            keys: ['all'],
            secrets: ['get', 'list', 'set', 'delete', 'backup', 'restore', 'recover', 'purge'],
            storage: ['get', 'list', 'delete', 'set', 'update', 'regeneratekey', 'recover', 'purge', 'backup', 'restore', 'setsas', 'listsas', 'getsas', 'deletesas']
        }
    };
    vault.properties.accessPolicies.push(accessPolicyEntry);
    
    await kvManagementClient.vaults.beginCreateOrUpdateAndWait(SampleUtil.config.groupName, vault.name, vault);
    
    console.log("Granted user access to vault.");

    const keysClient = new KeyClient(vault.properties.vaultUri,credential);
    await keysClient.createKey("key1",'RSA');
    await storageMgmtClient.storageAccounts.update(SampleUtil.config.groupName,storageAccount.name,{
        encryption:{
            keySource:"Microsoft.Keyvault",
            keyVaultProperties:{
                keyName:'key1',
                keyVaultUri:vault.properties.vaultUri
            },
            services: {
                blob: { enabled: true, keyType: "Account" }
            }
        },
        
    })
    
    console.log("Added storage account to vault.");
    return storageAccount;

}
async function updateStorageAccount(storageAccount, vault) {
    const keysClient = new KeyClient(vault.properties.vaultUri,credential);

    await keysClient.createKey("key2",'RSA');
    await storageMgmtClient.storageAccounts.update(SampleUtil.config.groupName,storageAccount.name,{
        encryption:{
            keySource:"Microsoft.Keyvault",
            keyVaultProperties:{
                keyName:'key2',
                keyVaultUri:vault.properties.vaultUri
            },
            services: {
                blob: { enabled: true, keyType: "Account" }
            }
        },
        
    });
}
async function regenerateStorageAccountKey(storageAccount) {
    console.log("Regenerating storage account key1");
    await storageMgmtClient.storageAccounts.regenerateKey(SampleUtil.config.groupName,storageAccount.name,{
        keyName:'key1'
    });
}
async function createAccountSASDefinition(storageAccount) {
    const policy = {
        keyToSign: "key1",
        sharedAccessStartTime:new Date("2022-04-11"),
        sharedAccessExpiryTime: new Date("2022-05-24"),
        protocols: "https,http",
        services: 'bfqt', // All services: blob, file, queue, and table
        resourceTypes: 'sco', // All resource types (service, template, object)
        permissions: 'acdlpruw', // All permissions: add, create, list, process, read, update, write
    };

    const sasToken = await storageMgmtClient.storageAccounts.listAccountSAS(SampleUtil.config.groupName, storageAccount.name, policy);
    const blobServiceClient = new BlobServiceClient(`https://${storageAccount.name}.blob.core.windows.net?${sasToken.accountSasToken}`);
    
    console.log("Created sample container using account SAS definition.");
    const containerClient = blobServiceClient.getContainerClient('sample-container');
    await containerClient.create();
    
    console.log("Created sample blob using account SAS definition.");
    const content = "test data";
    const blobName = "blob1";
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.upload(content, content.length);
    console.log(`Upload block blob ${blobName} successfully`);

}
async function deleteStorageAccount(storageAccount) {
    await storageMgmtClient.storageAccounts.update(SampleUtil.config.groupName,storageAccount.name,{
        encryption:{
            keySource:"Microsoft.Storage",
        },
        
    })
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
    await regenerateStorageAccountKey(storageAccount);

    // Demonstrate the creation of an account-level SAS definition 
    await createAccountSASDefinition(storageAccount);
    
    // Finally, remove the storage account from the vault
    await deleteStorageAccount(storageAccount);
    
    
}

main().then( () => { console.log("Sample execution complete."); } );