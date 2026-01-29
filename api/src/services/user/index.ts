/**
 * User Service Exports
 */

export {
  UserService,
  userService,
  type UserProfile,
  type LinkedAddress,
  type CreateUserInput,
  type UpdateUserInput,
  type UserServiceResult,
  type SubscriptionStatus,
  type SubscriptionTier,
  type PaymentProvider,
} from './user-service.js';

export {
  AddressLinkingService,
  addressLinkingService,
  type LinkAddressInput,
  type LinkedAddress as AddressLinkLinkedAddress,
  type UnifiedEmail,
  type UnifiedMailboxResult,
  type AddressLinkingResult,
} from './address-linking-service.js';
