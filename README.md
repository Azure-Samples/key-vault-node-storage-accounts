---
services: key-vault
platforms: nodejs
author: lusitanian
---

# Managed Azure Storage Account Keys for Azure Key Vault using the Azure Node SDK

This sample repo includes sample code demonstrating common mechanisms for managing storage account keys using Key Vault.

## Prerequisites
 * node.js 8+
 * An Azure Service Principal for running the sample on your Azure account. You can create an Azure service principal using one of the following guides:
     - [Azure CLI](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal-cli/),
     - [PowerShell](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal/)
     - [Azure Portal](https://azure.microsoft.com/documentation/articles/resource-group-create-service-principal-portal/). 

   
## Quickstart
1. If you don't have it, install [node.js](https://nodejs.org)
2. Set the following environment variables using the information from your service principal.
   ```
   export AZURE_SUBSCRIPTION_ID={your subscription id}
   export AZURE_CLIENT_ID={your client id}
   export AZURE_CLIENT_SECRET={your client secret}
   export AZURE_TENANT_ID={your tenant id as a GUID}
   export AZURE_CLIENT_OID={Object id of the service principal}
   ```
   > On Windows, use `set` instead of `export`.

3. Clone the repo, install node packages, and run.
     ```
     git clone https://github.com/Azure-Samples/key-vault-node-storage-accounts.git key-vault
     cd key-vault
     npm install
     node storage_account_sample.js
     ```
    
### Note ###
Certain portions of this sample require authenticated user to execute.  For this reason the sample will prompt the user to authenticate with a device code.  For more details see in-line comments in storage_acount_sample.js


## What does this sample do?
The storage account sample is broken down into 8 different methods called in sequence by the `main()` method in `storage_account_sample.js`: 
  ```
  async function main() {
    console.log('Azure Key Vault - Managed Storage Account Key Sample');
    
    // Get or create our sample vault
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
  ```
## References and further reading

- [Azure SDK for Node.js](https://github.com/Azure/azure-sdk-for-node)
- [Azure KeyVault Documentation](https://azure.microsoft.com/en-us/documentation/services/key-vault/)
- [Key Vault REST API Reference](https://msdn.microsoft.com/en-us/library/azure/dn903609.aspx)
- [Manage Key Vault using CLI](https://azure.microsoft.com/en-us/documentation/articles/key-vault-manage-with-cli/)
- [Storing and using secrets in Azure](https://blogs.msdn.microsoft.com/dotnet/2016/10/03/storing-and-using-secrets-in-azure/)
