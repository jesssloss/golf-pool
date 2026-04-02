-- Add payment configuration to pools
alter table pools add column payment_method text not null default 'e-transfer'
  check (payment_method in ('e-transfer', 'paypal', 'cash', 'other'));
alter table pools add column payment_details text;
