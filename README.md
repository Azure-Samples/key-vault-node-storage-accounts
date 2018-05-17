---
services: key-vault
platforms: nodejs
author: lusitanian
---

# Managed Azure Storage Account Keys for Azure Key Vault using the Azure Node SDK

This sample repo includes sample code demonstrating common mechanisms for managing storage account keys using Key Vault.

## Samples in this repo
* storage_account_sample.js
  * addStorageAccount -- Creates a storage account then adds the storage account to the vault to manage its keys.
  * updateStorageAccount -- Updates a storage account in the vault.
  * regenerateStorageAccountKey -- Regenerates a key of a storage account managed by the vault.
  * getStorageAccounts -- Lists the storage accounts in the vault, and gets each.
  * deleteStorageAccount -- Deletes a storage account from a vault.
  * createAccountSasDefinition -- Creates an account SAS definition, to manage storage account and its entities.
  * createBlobSasDefinition -- Creates a service SAS definition with access to a blob container.
  * getSasDefinitions -- List the SAS definitions for the storage account, and get each.

## How to run this sample

1. If you don't already have it, get [node.js](https://nodejs.org).

2. Clone the repo.

   ```
   git clone https://github.com/Azure-Samples/key-vault-node-storage-accounts.git key-vault
   ```

3. Install the dependencies.

   ```
   cd key-vault
   npm install
   ```

4. Create an Azure service principal, using one of the following:
   - [Azure CLI](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal-cli/),
   - [PowerShell](https://azure.microsoft.com/documentation/articles/resource-group-authenticate-service-principal/)
   - [Azure Portal](https://azure.microsoft.com/documentation/articles/resource-group-create-service-principal-portal/). 

    This service principal is to run the sample on your Azure account.

5. Set the following environment variables using the information from the service principal that you created.

   ```
   export AZURE_SUBSCRIPTION_ID={your subscription id}
   export AZURE_CLIENT_ID={your client id}
   export AZURE_CLIENT_SECRET={your client secret}
   export AZURE_TENANT_ID={your tenant id as a GUID}
   export AZURE_CLIENT_OID={Object id of the service principal}
   ```

> On Windows, use `set` instead of `export`.
##Note## Certain portions of this sample require authenticated user to execute.  For this reason the sample will prompt the user to authenticate with a device code.  For more details see in-line comments in storage_acount_sample.js

6. Run the sample.

    ```
    node storage_account_sample.js
    ```

## References and further reading

- [Azure SDK for Node.js](https://github.com/Azure/azure-sdk-for-node)
- [Azure KeyVault Documentation](https://azure.microsoft.com/en-us/documentation/services/key-vault/)
- [Key Vault REST API Reference](https://msdn.microsoft.com/en-us/library/azure/dn903609.aspx)
- [Manage Key Vault using CLI](https://azure.microsoft.com/en-us/documentation/articles/key-vault-manage-with-cli/)
- [Storing and using secrets in Azure](https://blogs.msdn.microsoft.com/dotnet/2016/10/03/storing-and-using-secrets-in-azure/)
