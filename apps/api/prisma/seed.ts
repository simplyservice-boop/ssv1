import {
  DocumentType,
  InspectionStatus,
  InspectionType,
  LeaseStatus,
  MessageStatus,
  NotificationChannel,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  TransactionStatus,
  TransactionType,
  UserRole,
  WorkOrderCategory,
  WorkOrderPriority,
  WorkOrderStatus,
} from '@prisma/client';
import { hashSync } from 'bcryptjs';

declare const process: { exit(code?: number): never };

const prisma = new PrismaClient();

function monthsFromNow(months: number, day = 1) {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth() + months, day);
}

async function main() {
  console.log('🌱 Starting seed...');

  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.message.deleteMany(),
    prisma.messageParticipant.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.document.deleteMany(),
    prisma.inspectionItem.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.workOrderComment.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.workOrder.deleteMany(),
    prisma.contractorProfile.deleteMany(),
    prisma.propertyPhoto.deleteMany(),
    prisma.propertyManager.deleteMany(),
    prisma.propertyOrganization.deleteMany(),
    prisma.lease.deleteMany(),
    prisma.unit.deleteMany(),
    prisma.property.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.organizationMember.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('🗑️  Cleaned database');

  const passwordHash = hashSync('Password123!', 10);

  const owner = await prisma.user.create({
    data: {
      email: 'owner@simplyservice.dev',
      passwordHash,
      firstName: 'Alex',
      lastName: 'Riverstone',
      role: UserRole.OWNER,
      phone: '412-555-0101',
      isVerified: true,
      isActive: true,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@simplyservice.dev',
      passwordHash,
      firstName: 'Jordan',
      lastName: 'Park',
      role: UserRole.MANAGER,
      phone: '412-555-0102',
      isVerified: true,
      isActive: true,
    },
  });

  const tenant1 = await prisma.user.create({
    data: {
      email: 'tenant1@simplyservice.dev',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Chen',
      role: UserRole.TENANT,
      phone: '412-555-0103',
      isVerified: true,
      isActive: true,
    },
  });

  const tenant2 = await prisma.user.create({
    data: {
      email: 'tenant2@simplyservice.dev',
      passwordHash,
      firstName: 'Sofia',
      lastName: 'Reyes',
      role: UserRole.TENANT,
      phone: '412-555-0104',
      isVerified: true,
      isActive: true,
    },
  });

  const contractor1 = await prisma.user.create({
    data: {
      email: 'contractor1@simplyservice.dev',
      passwordHash,
      firstName: 'Derek',
      lastName: 'Mills',
      role: UserRole.CONTRACTOR,
      phone: '412-555-0105',
      isVerified: true,
      isActive: true,
    },
  });

  const contractor2 = await prisma.user.create({
    data: {
      email: 'contractor2@simplyservice.dev',
      passwordHash,
      firstName: 'Priya',
      lastName: 'Nguyen',
      role: UserRole.CONTRACTOR,
      phone: '412-555-0106',
      isVerified: true,
      isActive: true,
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: 'admin@simplyservice.dev',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: UserRole.ADMIN,
      phone: '412-555-0107',
      isVerified: true,
      isActive: true,
    },
  });

  const vendor = await prisma.user.create({
    data: {
      email: 'vendor@simplyservice.dev',
      passwordHash,
      firstName: 'Val',
      lastName: 'Vendor',
      role: UserRole.VENDOR,
      phone: '412-555-0108',
      isVerified: true,
      isActive: true,
    },
  });

  const utilityProvider = await prisma.user.create({
    data: {
      email: 'utility@simplyservice.dev',
      passwordHash,
      firstName: 'Uma',
      lastName: 'Utilities',
      role: UserRole.UTILITY_PROVIDER,
      phone: '412-555-0109',
      isVerified: true,
      isActive: true,
    },
  });

  const insurancePartner = await prisma.user.create({
    data: {
      email: 'insurance@simplyservice.dev',
      passwordHash,
      firstName: 'Iris',
      lastName: 'Insurance',
      role: UserRole.INSURANCE_PARTNER,
      phone: '412-555-0110',
      isVerified: true,
      isActive: true,
    },
  });

  const financialInstitution = await prisma.user.create({
    data: {
      email: 'finance@simplyservice.dev',
      passwordHash,
      firstName: 'Fin',
      lastName: 'Institution',
      role: UserRole.FINANCIAL_INSTITUTION,
      phone: '412-555-0111',
      isVerified: true,
      isActive: true,
    },
  });

  const enterprise = await prisma.user.create({
    data: {
      email: 'enterprise@simplyservice.dev',
      passwordHash,
      firstName: 'Evan',
      lastName: 'Enterprise',
      role: UserRole.ENTERPRISE,
      phone: '412-555-0112',
      isVerified: true,
      isActive: true,
    },
  });

  const municipalPartner = await prisma.user.create({
    data: {
      email: 'municipal@simplyservice.dev',
      passwordHash,
      firstName: 'Mona',
      lastName: 'Municipal',
      role: UserRole.MUNICIPAL_PARTNER,
      phone: '412-555-0113',
      isVerified: true,
      isActive: true,
    },
  });

  console.log('✅ Users created');

  const utilityOrg = await prisma.organization.create({
    data: {
      name: 'Pittsburgh Utility Group',
      type: UserRole.UTILITY_PROVIDER,
      isActive: true,
      website: 'https://example-utility.local',
      city: 'Pittsburgh',
      state: 'PA',
      country: 'US',
    },
  });

  const financeOrg = await prisma.organization.create({
    data: {
      name: 'Three Rivers Financial',
      type: UserRole.FINANCIAL_INSTITUTION,
      isActive: true,
      website: 'https://example-finance.local',
      city: 'Pittsburgh',
      state: 'PA',
      country: 'US',
    },
  });

  await prisma.organizationMember.createMany({
    data: [
      { organizationId: utilityOrg.id, userId: utilityProvider.id, role: 'OPERATIONS_LEAD' },
      { organizationId: financeOrg.id, userId: financialInstitution.id, role: 'ACCOUNT_MANAGER' },
      { organizationId: financeOrg.id, userId: enterprise.id, role: 'PORTFOLIO_LIAISON' },
      { organizationId: utilityOrg.id, userId: municipalPartner.id, role: 'CITY_COORDINATOR' },
      { organizationId: utilityOrg.id, userId: vendor.id, role: 'FIELD_VENDOR' },
      { organizationId: financeOrg.id, userId: insurancePartner.id, role: 'RISK_PARTNER' },
    ],
  });

  console.log('✅ Organizations created');

  await prisma.contractorProfile.createMany({
    data: [
      {
        userId: contractor1.id,
        companyName: 'Mills Plumbing & HVAC',
        licenseNumber: 'PA-PLB-2019-4421',
        licenseState: 'PA',
        insurancePolicy: 'INS-2024-MM-88321',
        specialties: ['PLUMBING', 'HVAC'],
        hourlyRate: 95,
        bio: 'Licensed plumber and HVAC technician with 12 years of experience.',
        serviceRadius: 30,
        rating: 4.8,
        reviewCount: 47,
        isVerified: true,
      },
      {
        userId: contractor2.id,
        companyName: 'Nguyen Electric',
        licenseNumber: 'PA-ELC-2020-7734',
        licenseState: 'PA',
        insurancePolicy: 'INS-2024-PN-55210',
        specialties: ['ELECTRICAL', 'SECURITY'],
        hourlyRate: 110,
        bio: 'Master electrician for residential and mixed-use properties.',
        serviceRadius: 25,
        rating: 4.9,
        reviewCount: 62,
        isVerified: true,
      },
    ],
  });

  console.log('✅ Contractor profiles created');

  const properties = await Promise.all([
    prisma.property.create({
      data: {
        ownerId: owner.id,
        name: 'Shadyside Apartments',
        type: PropertyType.APARTMENT_COMPLEX,
        status: PropertyStatus.ACTIVE,
        address: '5401 Walnut St',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15232',
        country: 'US',
        latitude: 40.453,
        longitude: -79.929,
        yearBuilt: 1948,
        sqFootage: 5400,
        units: 6,
        bedrooms: 2,
        bathrooms: 1,
        description: 'Classic Shadyside apartment building, renovated in 2020.',
        currentValue: 1480000,
        isListed: false,
        aiSummary: 'Stable multifamily asset with active leases and moderate maintenance volume.',
      },
    }),
    prisma.property.create({
      data: {
        ownerId: owner.id,
        name: 'Lawrenceville Townhomes',
        type: PropertyType.MULTI_FAMILY,
        status: PropertyStatus.ACTIVE,
        address: '3812 Butler St',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15201',
        country: 'US',
        latitude: 40.465,
        longitude: -79.952,
        yearBuilt: 1965,
        sqFootage: 3600,
        units: 3,
        bedrooms: 3,
        bathrooms: 2,
        description: 'Townhome portfolio in Lawrenceville with strong tenant demand.',
        currentValue: 1095000,
      },
    }),
    prisma.property.create({
      data: {
        ownerId: owner.id,
        name: 'East Liberty Retail Hub',
        type: PropertyType.RETAIL,
        status: PropertyStatus.ACTIVE,
        address: '6001 Centre Ave',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15206',
        country: 'US',
        latitude: 40.4598,
        longitude: -79.9203,
        yearBuilt: 1955,
        sqFootage: 8000,
        units: 4,
        description: 'Mixed retail storefronts with shared parking and rooftop HVAC.',
        currentValue: 2140000,
      },
    }),
    prisma.property.create({
      data: {
        ownerId: owner.id,
        name: 'North Shore Flex Space',
        type: PropertyType.MIXED_USE,
        status: PropertyStatus.ACTIVE,
        address: '125 W North Ave',
        city: 'Pittsburgh',
        state: 'PA',
        zip: '15212',
        country: 'US',
        latitude: 40.4486,
        longitude: -80.0052,
        yearBuilt: 2006,
        sqFootage: 6200,
        units: 2,
        description: 'Flexible mixed-use building used for light commercial and office occupancy.',
        currentValue: 1760000,
      },
    }),
  ]);

  const [prop1, prop2, prop3, prop4] = properties;

  await prisma.propertyPhoto.createMany({
    data: [
      { propertyId: prop1.id, url: '/uploads/properties/shadyside-cover.jpg', caption: 'Front elevation', isPrimary: true, order: 1 },
      { propertyId: prop2.id, url: '/uploads/properties/lawrenceville-cover.jpg', caption: 'Street view', isPrimary: true, order: 1 },
      { propertyId: prop3.id, url: '/uploads/properties/east-liberty-cover.jpg', caption: 'Retail frontage', isPrimary: true, order: 1 },
      { propertyId: prop4.id, url: '/uploads/properties/north-shore-cover.jpg', caption: 'Entry court', isPrimary: true, order: 1 },
    ],
  });

  await prisma.propertyManager.createMany({
    data: [
      { propertyId: prop1.id, managerId: manager.id, isActive: true },
      { propertyId: prop2.id, managerId: manager.id, isActive: true },
      { propertyId: prop3.id, managerId: manager.id, isActive: true },
      { propertyId: prop4.id, managerId: manager.id, isActive: true },
    ],
  });

  console.log('✅ Properties created');

  const [u1a, u1b, u2a, th1] = await Promise.all([
    prisma.unit.create({
      data: {
        propertyId: prop1.id,
        unitNumber: '1A',
        floor: 1,
        bedrooms: 2,
        bathrooms: 1,
        sqFootage: 850,
        monthlyRent: 1450,
        isAvailable: false,
        description: 'Updated kitchen with hardwood floors.',
      },
    }),
    prisma.unit.create({
      data: {
        propertyId: prop1.id,
        unitNumber: '1B',
        floor: 1,
        bedrooms: 1,
        bathrooms: 1,
        sqFootage: 620,
        monthlyRent: 1150,
        isAvailable: true,
      },
    }),
    prisma.unit.create({
      data: {
        propertyId: prop1.id,
        unitNumber: '2A',
        floor: 2,
        bedrooms: 2,
        bathrooms: 2,
        sqFootage: 950,
        monthlyRent: 1650,
        isAvailable: false,
      },
    }),
    prisma.unit.create({
      data: {
        propertyId: prop2.id,
        unitNumber: 'TH-1',
        floor: 1,
        bedrooms: 3,
        bathrooms: 2,
        sqFootage: 1200,
        monthlyRent: 2100,
        isAvailable: false,
      },
    }),
  ]);

  await prisma.unit.createMany({
    data: [
      {
        propertyId: prop3.id,
        unitNumber: 'Retail-A',
        floor: 1,
        sqFootage: 1800,
        isAvailable: false,
        description: 'Corner retail suite with street exposure.',
      },
      {
        propertyId: prop4.id,
        unitNumber: 'Flex-A',
        floor: 1,
        sqFootage: 3100,
        isAvailable: true,
        description: 'Flexible office and light operations suite.',
      },
    ],
  });

  console.log('✅ Units created');

  const lease1 = await prisma.lease.create({
    data: {
      propertyId: prop1.id,
      unitId: u1a.id,
      tenantId: tenant1.id,
      status: LeaseStatus.ACTIVE,
      startDate: monthsFromNow(-3, 1),
      endDate: monthsFromNow(9, 1),
      monthlyRent: 1450,
      securityDeposit: 1450,
      lateFeeAmount: 75,
      lateFeeGraceDays: 5,
      terms: 'Standard residential lease. No smoking. Pets with approval.',
      signedAt: monthsFromNow(-3, 1),
    },
  });

  const lease2 = await prisma.lease.create({
    data: {
      propertyId: prop2.id,
      unitId: th1.id,
      tenantId: tenant2.id,
      status: LeaseStatus.ACTIVE,
      startDate: monthsFromNow(-1, 15),
      endDate: monthsFromNow(11, 14),
      monthlyRent: 2100,
      securityDeposit: 4200,
      lateFeeAmount: 100,
      lateFeeGraceDays: 3,
      terms: 'Townhome lease. Tenant handles lawn care and snow removal.',
      signedAt: monthsFromNow(-1, 10),
    },
  });

  console.log('✅ Leases created');

  const now = new Date();

  const wo1 = await prisma.workOrder.create({
    data: {
      propertyId: prop1.id,
      unitId: u1a.id,
      creatorId: tenant1.id,
      assigneeId: contractor1.id,
      title: 'Kitchen Faucet Leak',
      description: 'Kitchen faucet in unit 1A is dripping and the cabinet below is damp.',
      status: WorkOrderStatus.IN_PROGRESS,
      priority: WorkOrderPriority.HIGH,
      category: WorkOrderCategory.PLUMBING,
      estimatedCost: 250,
      scheduledAt: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
      dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  const wo2 = await prisma.workOrder.create({
    data: {
      propertyId: prop1.id,
      creatorId: manager.id,
      title: 'HVAC Annual Maintenance',
      description: 'Perform annual inspection and filter replacement across occupied units.',
      status: WorkOrderStatus.OPEN,
      priority: WorkOrderPriority.MEDIUM,
      category: WorkOrderCategory.HVAC,
      estimatedCost: 850,
      scheduledAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const wo3 = await prisma.workOrder.create({
    data: {
      propertyId: prop2.id,
      unitId: th1.id,
      creatorId: tenant2.id,
      assigneeId: contractor2.id,
      title: 'Electrical Panel Inspection',
      description: 'Breaker tripped twice in TH-1. Inspect panel and related branch circuits.',
      status: WorkOrderStatus.OPEN,
      priority: WorkOrderPriority.HIGH,
      category: WorkOrderCategory.ELECTRICAL,
      estimatedCost: 350,
      dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    },
  });

  const wo4 = await prisma.workOrder.create({
    data: {
      propertyId: prop3.id,
      creatorId: owner.id,
      title: 'Parking Lot Resurfacing',
      description: 'Seal coat and repair cracking in the main customer lot.',
      status: WorkOrderStatus.COMPLETED,
      priority: WorkOrderPriority.LOW,
      category: WorkOrderCategory.OTHER,
      estimatedCost: 3200,
      actualCost: 3100,
      completedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.workOrderComment.createMany({
    data: [
      {
        workOrderId: wo1.id,
        authorId: contractor1.id,
        content: 'Inspected the faucet. Cartridge replacement is scheduled for Thursday morning.',
      },
      {
        workOrderId: wo1.id,
        authorId: tenant1.id,
        content: 'Thanks. I can provide access through the front desk if needed.',
      },
      {
        workOrderId: wo3.id,
        authorId: contractor2.id,
        content: 'Will inspect Thursday morning. Please ensure access to the electrical panel.',
      },
    ],
  });

  console.log('✅ Work orders and comments created');

  for (let i = 3; i >= 0; i -= 1) {
    const dueDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
    await prisma.transaction.create({
      data: {
        propertyId: prop1.id,
        userId: tenant1.id,
        leaseId: lease1.id,
        type: TransactionType.RENT_PAYMENT,
        status: TransactionStatus.COMPLETED,
        amount: 1450,
        description: `Rent payment for ${dueDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
        dueDate,
        paidAt: dueDate,
      },
    });
  }

  await prisma.transaction.createMany({
    data: [
      {
        propertyId: prop2.id,
        userId: tenant2.id,
        leaseId: lease2.id,
        type: TransactionType.SECURITY_DEPOSIT,
        status: TransactionStatus.COMPLETED,
        amount: 4200,
        description: 'Security deposit for Lawrenceville TH-1',
        paidAt: monthsFromNow(-1, 15),
      },
      {
        propertyId: prop1.id,
        userId: owner.id,
        workOrderId: wo2.id,
        type: TransactionType.MAINTENANCE_FEE,
        status: TransactionStatus.COMPLETED,
        amount: 850,
        description: 'Annual HVAC maintenance for Shadyside Apartments',
        paidAt: new Date(now.getFullYear(), now.getMonth() - 1, 15),
      },
      {
        propertyId: prop3.id,
        userId: owner.id,
        workOrderId: wo4.id,
        type: TransactionType.CONTRACTOR_PAYMENT,
        status: TransactionStatus.COMPLETED,
        amount: 3100,
        description: 'Parking lot resurfacing vendor payment',
        paidAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  console.log('✅ Transactions created');

  const inspection1 = await prisma.inspection.create({
    data: {
      propertyId: prop1.id,
      creatorId: manager.id,
      type: InspectionType.MOVE_IN,
      status: InspectionStatus.COMPLETED,
      scheduledAt: monthsFromNow(-3, 1),
      completedAt: monthsFromNow(-3, 1),
      inspector: 'Jordan Park',
      overallScore: 92,
      findings: { walls: 'good', floors: 'excellent', appliances: 'new' },
      notes: 'Unit in excellent condition. Minor scuff on the living room wall.',
    },
  });

  await prisma.inspectionItem.createMany({
    data: [
      { inspectionId: inspection1.id, area: 'Interior', item: 'Living Room', condition: 'GOOD', notes: 'Minor scuff on north wall', photoUrls: [] },
      { inspectionId: inspection1.id, area: 'Interior', item: 'Kitchen', condition: 'EXCELLENT', notes: 'All appliances recently replaced', photoUrls: [] },
      { inspectionId: inspection1.id, area: 'Interior', item: 'Bathroom', condition: 'GOOD', notes: 'Clean and fully functional', photoUrls: [] },
    ],
  });

  await prisma.inspection.create({
    data: {
      propertyId: prop1.id,
      creatorId: manager.id,
      type: InspectionType.ROUTINE,
      status: InspectionStatus.SCHEDULED,
      scheduledAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
      inspector: 'Jordan Park',
      notes: 'Annual common area and occupied-unit spot check.',
    },
  });

  console.log('✅ Inspections created');

  await prisma.document.createMany({
    data: [
      {
        uploaderId: manager.id,
        propertyId: prop1.id,
        leaseId: lease1.id,
        name: 'Lease Agreement - Unit 1A',
        type: DocumentType.LEASE,
        mimeType: 'application/pdf',
        size: 245000,
        url: '/uploads/documents/demo-lease-1a.pdf',
        s3Key: 'documents/demo-lease-1a.pdf',
      },
      {
        uploaderId: owner.id,
        propertyId: prop1.id,
        name: 'Shadyside Insurance Certificate 2025',
        type: DocumentType.INSURANCE_POLICY,
        mimeType: 'application/pdf',
        size: 128000,
        url: '/uploads/documents/demo-insurance-shadyside.pdf',
        s3Key: 'documents/demo-insurance-shadyside.pdf',
      },
      {
        uploaderId: contractor1.id,
        propertyId: prop1.id,
        workOrderId: wo1.id,
        name: 'Faucet Repair Invoice',
        type: DocumentType.INVOICE,
        mimeType: 'application/pdf',
        size: 52000,
        url: '/uploads/documents/demo-invoice-faucet.pdf',
        s3Key: 'documents/demo-invoice-faucet.pdf',
      },
    ],
  });

  console.log('✅ Documents created');

  const conversation1 = await prisma.conversation.create({
    data: {
      propertyId: prop1.id,
      subject: 'Kitchen Faucet Repair Scheduling',
      participants: {
        create: [
          { userId: tenant1.id },
          { userId: contractor1.id },
          { userId: manager.id },
        ],
      },
    },
  });

  const conversation2 = await prisma.conversation.create({
    data: {
      propertyId: prop2.id,
      subject: 'Move-In Questions',
      participants: {
        create: [
          { userId: tenant2.id },
          { userId: manager.id },
        ],
      },
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: conversation1.id,
        senderId: tenant1.id,
        content: 'Hi Derek, just checking in on the faucet repair timeline.',
        status: MessageStatus.READ,
        attachmentUrls: [],
      },
      {
        conversationId: conversation1.id,
        senderId: contractor1.id,
        content: 'Parts arrived today. I can come Thursday between 10am and noon.',
        status: MessageStatus.READ,
        attachmentUrls: [],
      },
      {
        conversationId: conversation2.id,
        senderId: tenant2.id,
        content: 'Which day is trash pickup for the townhome?',
        status: MessageStatus.DELIVERED,
        attachmentUrls: [],
      },
      {
        conversationId: conversation2.id,
        senderId: manager.id,
        content: 'Tuesday and Friday for trash, with recycling every other Tuesday.',
        status: MessageStatus.DELIVERED,
        attachmentUrls: [],
      },
    ],
  });

  console.log('✅ Conversations and messages created');

  await prisma.notification.createMany({
    data: [
      {
        userId: tenant1.id,
        type: 'WORK_ORDER_UPDATE',
        channel: NotificationChannel.IN_APP,
        title: 'Work Order Update',
        body: 'Your kitchen faucet repair is now in progress.',
        isRead: false,
        data: { workOrderId: wo1.id, route: `/work-orders/${wo1.id}` },
      },
      {
        userId: manager.id,
        type: 'WORK_ORDER_CREATED',
        channel: NotificationChannel.IN_APP,
        title: 'New Work Order',
        body: 'Electrical Panel Inspection was submitted for Lawrenceville TH-1.',
        isRead: false,
        data: { workOrderId: wo3.id, route: `/work-orders/${wo3.id}` },
      },
      {
        userId: owner.id,
        type: 'PAYMENT_RECEIVED',
        channel: NotificationChannel.IN_APP,
        title: 'Rent Received',
        body: 'Marcus Chen paid $1,450 rent for unit 1A.',
        isRead: true,
        data: { route: '/financial' },
      },
      {
        userId: contractor1.id,
        type: 'WORK_ORDER_ASSIGNED',
        channel: NotificationChannel.IN_APP,
        title: 'Work Order Assigned',
        body: 'You have been assigned Kitchen Faucet Leak at Shadyside Apartments.',
        isRead: true,
        data: { workOrderId: wo1.id, route: `/work-orders/${wo1.id}` },
      },
      {
        userId: admin.id,
        type: 'SYSTEM_SUMMARY',
        channel: NotificationChannel.IN_APP,
        title: 'Seed Completed',
        body: 'Demo data loaded for owners, tenants, contractors, and map-enabled properties.',
        isRead: false,
        data: { propertyCount: 4, userCount: 7 },
      },
    ],
  });

  console.log('✅ Notifications created');
  console.log('');
  console.log('🎉 Seed complete! Demo credentials (password: Password123!)');
  console.log('   owner@simplyservice.dev       — Owner dashboard');
  console.log('   manager@simplyservice.dev     — Manager dashboard');
  console.log('   tenant1@simplyservice.dev     — Tenant dashboard');
  console.log('   tenant2@simplyservice.dev     — Tenant dashboard');
  console.log('   contractor1@simplyservice.dev — Contractor dashboard');
  console.log('   contractor2@simplyservice.dev — Contractor dashboard');
  console.log('   admin@simplyservice.dev       — Admin dashboard');
  console.log('   vendor@simplyservice.dev      — Vendor workspace');
  console.log('   utility@simplyservice.dev     — Utility provider workspace');
  console.log('   insurance@simplyservice.dev   — Insurance partner workspace');
  console.log('   finance@simplyservice.dev     — Financial institution workspace');
  console.log('   enterprise@simplyservice.dev  — Enterprise workspace');
  console.log('   municipal@simplyservice.dev   — Municipal partner workspace');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
