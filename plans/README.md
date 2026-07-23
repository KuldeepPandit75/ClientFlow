# ClientFlow Delivery Plans

This folder is the source of truth for implementation sequencing. Product behavior belongs in `docs/`; executable verification belongs in `tests/`.

## Active plan

- [Web WhatsApp product plan](./web-whatsapp-product-plan.md)

## Delivery rule

A phase is complete only when its code, automated tests, and documentation are committed together. A screen or route without persistence and access-control tests is not considered complete.
